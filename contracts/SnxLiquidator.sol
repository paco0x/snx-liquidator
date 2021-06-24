//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol';
import '@uniswap/v3-core/contracts/interfaces/pool/IUniswapV3PoolActions.sol';
import '@uniswap/v3-core/contracts/libraries/TickMath.sol';

import './DydxHelper.sol';

import 'hardhat/console.sol';

// Standard ERC-20 interface
interface IERC20 {
    function totalSupply() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function transfer(address recipient, uint256 amount) external returns (bool);

    function allowance(address owner, address spender) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

interface IWETH is IERC20 {
    function deposit() external payable;

    function withdraw(uint256 wad) external;
}

interface ICurveFi {
    function exchange(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256);
}

enum LoanType {
    Susd,
    Seth
}

interface IEtherCollatoral {
    function liquidateUnclosedLoan(address _loanCreatorsAddress, uint256 _loanID) external;

    function accruedInterestOnLoan(uint256 _loanAmount, uint256 _seconds)
        external
        view
        returns (uint256 interestAmount);

    function getLoan(address _account, uint256 _loanID)
        external
        view
        returns (
            address account,
            uint256 collateralAmount,
            uint256 loanAmount,
            uint256 timeCreated,
            uint256 loanID,
            uint256 timeClosed,
            uint256 accruedInterest,
            uint256 totalFees
        );
}

contract SnxLiquidator is IUniswapV3SwapCallback, IDydxCallee, ReentrancyGuard {
    address private owner;
    IWETH private WETH = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    ISoloMargin private soloMargin = ISoloMargin(0x1E0447b19BB6EcFdAe1e4AE1694b0C3659614e4e);

    address private susdLoan = 0xfED77055B40d63DCf17ab250FFD6948FBFF57B82;
    address private sethLoan = 0x7133afF303539b0A4F60Ab9bd9656598BF49E272;

    IERC20 private immutable susd = IERC20(0x57Ab1ec28D129707052df4dF418D58a2D46d5f51);
    IERC20 private immutable seth = IERC20(0x5e74C9036fb86BD7eCdcb084a0673EFc32eA31cb);

    IUniswapV3PoolActions private immutable usdcWethPool =
        IUniswapV3PoolActions(0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8);

    constructor() {
        owner = msg.sender;
        WETH.approve(address(soloMargin), type(uint256).max);
    }

    receive() external payable {}

    function liquidate(
        address _account,
        uint256 _loanID,
        address _loanAddress
    ) external nonReentrant {
        require(_loanAddress == susdLoan || _loanAddress == sethLoan, 'IA');
        LoanType loanType = _loanAddress == susdLoan ? LoanType.Susd : LoanType.Seth;

        IEtherCollatoral loanContract = IEtherCollatoral(_loanAddress);
        (, , uint256 loanAmount, , , uint256 timeClosed, uint256 accruedInterest, ) = loanContract.getLoan(
            _account,
            _loanID
        );

        uint256 repayAmount = loanAmount + accruedInterest;

        require(timeClosed != 0, 'NC');
        require(repayAmount > 0, 'ZR');

        if (loanType == LoanType.Susd) {
            // Note: susd uses 18 decimals while usdc uses 6 decimals
            //       and we just roughly estimate the slippage on curve is 2%
            uint256 usdcAmount = ((repayAmount / 1e12) * 100) / 98;
            usdcWethPool.swap(
                address(this),
                true,
                -int256(usdcAmount),
                TickMath.MIN_SQRT_RATIO + 1,
                abi.encode(address(usdcWethPool))
            );
        } else {}
    }

    function dydxFlashLoan(uint256 _loanAmount, uint256 _repayAmount) internal {
        Actions.ActionArgs[] memory operations = new Actions.ActionArgs[](3);

        operations[0] = Actions.ActionArgs({
            actionType: Actions.ActionType.Withdraw,
            accountId: 0,
            amount: Types.AssetAmount({
                sign: false,
                denomination: Types.AssetDenomination.Wei,
                ref: Types.AssetReference.Delta,
                value: _loanAmount // Amount to borrow
            }),
            primaryMarketId: 0, // WETH
            secondaryMarketId: 0,
            otherAddress: address(this),
            otherAccountId: 0,
            data: ''
        });

        operations[1] = Actions.ActionArgs({
            actionType: Actions.ActionType.Call,
            accountId: 0,
            amount: Types.AssetAmount({
                sign: false,
                denomination: Types.AssetDenomination.Wei,
                ref: Types.AssetReference.Delta,
                value: 0
            }),
            primaryMarketId: 0,
            secondaryMarketId: 0,
            otherAddress: address(this),
            otherAccountId: 0,
            data: abi.encode(_loanAmount)
        });

        operations[2] = Actions.ActionArgs({
            actionType: Actions.ActionType.Deposit,
            accountId: 0,
            amount: Types.AssetAmount({
                sign: true,
                denomination: Types.AssetDenomination.Wei,
                ref: Types.AssetReference.Delta,
                value: _loanAmount + 2 // Repayment amount with 2 wei fee
            }),
            primaryMarketId: 0, // WETH
            secondaryMarketId: 0,
            otherAddress: address(this),
            otherAccountId: 0,
            data: ''
        });

        Account.Info[] memory accountInfos = new Account.Info[](1);
        accountInfos[0] = Account.Info({owner: address(this), number: 1});

        soloMargin.operate(accountInfos, operations);
    }

    // Dydx flash loan callback function
    function callFunction(
        address sender,
        Account.Info memory accountInfo,
        bytes memory data
    ) external override {}

    // Uniswap v3 swap callback function
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external override {
        require(msg.sender == address(usdcWethPool), "IS");
    }
}
