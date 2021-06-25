//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import '@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol';
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

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
    ) external payable returns (uint256);
}

interface ICurveFiV2 {
    function exchange(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external;
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

interface ChiToken {
    function freeUpTo(uint256 value) external returns (uint256);
    function mint(uint256 value) external;
}

enum LoanType {
    Susd,
    Seth
}

contract SnxLiquidator is IDydxCallee {
    address public owner;
    IWETH private weth = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    ISoloMargin private soloMargin = ISoloMargin(0x1E0447b19BB6EcFdAe1e4AE1694b0C3659614e4e);

    address private susdLoan = 0xfED77055B40d63DCf17ab250FFD6948FBFF57B82;
    address private sethLoan = 0x7133afF303539b0A4F60Ab9bd9656598BF49E272;

    IERC20 private immutable susd = IERC20(0x57Ab1ec28D129707052df4dF418D58a2D46d5f51);
    IERC20 private immutable seth = IERC20(0x5e74C9036fb86BD7eCdcb084a0673EFc32eA31cb);

    address private immutable usdc = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    IQuoter private immutable quoter = IQuoter(0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6);
    ISwapRouter private immutable uniRouter = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    ICurveFiV2 private immutable curveSusdPool = ICurveFiV2(0xA5407eAE9Ba41422680e2e00537571bcC53efBfD);
    ICurveFi private immutable curveSethPool = ICurveFi(0xc5424B857f758E906013F3555Dad202e4bdB4567);

    ChiToken private constant chi = ChiToken(0x0000000000004946c0e9F43F4Dee607b0eF1fA1c);

    modifier discountCHI {
        uint256 gasStart = gasleft();

        _;

        uint256 gasSpent = 21000 + gasStart - gasleft() + 16 * msg.data.length;
        console.log('Gas spent: ', gasSpent);
        chi.freeUpTo((gasSpent + 14154) / 41947);
    }

    constructor() {
        owner = msg.sender;
        weth.approve(address(soloMargin), type(uint256).max);
    }

    receive() external payable {}

    function mintCHI(uint256 value) external {
        chi.mint(value);
    }

    function withdraw(address token) external {
        require(owner == msg.sender, 'NO');
        if (token == address(0)) {
            payable(msg.sender).transfer(address(this).balance);
        } else {
            IERC20(token).transfer(msg.sender, IERC20(token).balanceOf(address(this)));
        }
    }

    function liquidate(
        address account,
        uint256 loanID,
        LoanType loanType,
        uint256 bribeBP
    ) external discountCHI {
        IEtherCollatoral loanContract;
        if (loanType == LoanType.Susd) {
            loanContract = IEtherCollatoral(susdLoan);
        } else {
            loanContract = IEtherCollatoral(sethLoan);
        }

        (, , uint256 loanAmount, , , uint256 timeClosed, uint256 accruedInterest, ) = loanContract.getLoan(
            account,
            loanID
        );

        uint256 repayAmount = loanAmount + accruedInterest;
        console.log('SUSD/SETH amount waiting to repay: ', repayAmount / 1e18);

        require(timeClosed == 0, 'Closed');
        require(repayAmount > 0, 'Zero Repay');

        if (loanType == LoanType.Susd) {
            // Note: susd uses 18 decimals while usdc uses 6 decimals
            //       and we just roughly estimate the slippage on curve is 2%
            uint256 usdcAmount = ((repayAmount / 1e12) * 100) / 98;
            // roughly use 200 to avoid more calc since flash loan fee is low in dydx
            uint256 wethLoanAmount = 200 ether;
            dydxFlashLoan(account, loanID, wethLoanAmount, repayAmount, loanType, usdcAmount);
        } else {
            // slippage on curve is about 1.5%, use 2% here
            uint256 wethLoanAmount = (repayAmount * 100) / 98;
            // console.log('WETH loan amount: ', wethLoanAmount / 1e18);
            dydxFlashLoan(account, loanID, wethLoanAmount, repayAmount, loanType, 0);
        }

        uint256 ethBalance = address(this).balance;
        // console.log('ETH balance after repay the debt: ', ethBalance / 1e18);

        // calculate bribe for miner
        uint256 bribeAmount = 0;
        if (bribeBP > 0) {
            bribeAmount = (ethBalance * bribeBP) / 10000;
            bribe(bribeAmount);
        }

        payable(owner).transfer(ethBalance - bribeAmount);
    }

    function bribe(uint256 amount) internal {
        // console.log('Bribe amount: ', amount);
        block.coinbase.call{value: amount}('');
    }

    function dydxFlashLoan(
        address snxAccount,
        uint256 snxLoanID,
        uint256 loanAmount,
        uint256 repayAmount,
        LoanType loanType,
        uint256 usdcAmount
    ) internal {
        Actions.ActionArgs[] memory operations = new Actions.ActionArgs[](3);

        operations[0] = Actions.ActionArgs({
            actionType: Actions.ActionType.Withdraw,
            accountId: 0,
            amount: Types.AssetAmount({
                sign: false,
                denomination: Types.AssetDenomination.Wei,
                ref: Types.AssetReference.Delta,
                value: loanAmount // Amount to borrow
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
            data: abi.encode(snxAccount, snxLoanID, loanAmount, repayAmount, loanType, usdcAmount)
        });

        operations[2] = Actions.ActionArgs({
            actionType: Actions.ActionType.Deposit,
            accountId: 0,
            amount: Types.AssetAmount({
                sign: true,
                denomination: Types.AssetDenomination.Wei,
                ref: Types.AssetReference.Delta,
                value: loanAmount + 2 // Repayment amount with 2 wei fee
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
        Account.Info memory,
        bytes memory data
    ) external override {
        require(sender == address(this), 'Not from this contract');

        (
            address account,
            uint256 loanID,
            uint256 loanAmount,
            uint256 repayAmount,
            LoanType loanType,
            uint256 usdcAmount
        ) = abi.decode(data, (address, uint256, uint256, uint256, LoanType, uint256));

        if (loanType == LoanType.Susd) {
            weth.approve(address(uniRouter), loanAmount);
            ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter.ExactOutputSingleParams(
                address(weth),
                usdc,
                3000,
                address(this),
                block.timestamp,
                usdcAmount,
                loanAmount,
                0
            );
            uint256 wethSpent = uniRouter.exactOutputSingle(params);

            // coin index in curve susd pool: 1 => usdc, 3 => susd
            // swap usdc to susd
            IERC20(usdc).approve(address(curveSusdPool), usdcAmount);
            curveSusdPool.exchange(1, 3, usdcAmount, repayAmount);

            susd.approve(susdLoan, repayAmount);
            IEtherCollatoral(susdLoan).liquidateUnclosedLoan(account, loanID);

            weth.deposit{value: wethSpent + 2}();
        } else {
            weth.withdraw(loanAmount);
            // coin index in curve seth pool: 0 => eth, 1 => seth
            // swap eth for seth
            curveSethPool.exchange{value: loanAmount}(0, 1, loanAmount, repayAmount);

            seth.approve(sethLoan, repayAmount);
            IEtherCollatoral(sethLoan).liquidateUnclosedLoan(account, loanID);

            weth.deposit{value: loanAmount + 2}();
        }
    }
}
