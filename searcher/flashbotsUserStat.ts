import { createFlashbotsProvider } from './flashbotsBase';

async function main() {
  const flashbotsProvider = await createFlashbotsProvider();
  const stat = await flashbotsProvider.getUserStats();
  console.log(stat);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
