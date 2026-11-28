import { createPrivateCompletionPage, privateDeliveryDirectory, readDeliveryRecords } from "./lib/delivery-ledger.mjs";
const index = process.argv.indexOf("--delivery-dir");
const directory = privateDeliveryDirectory(process.cwd(), index === -1 ? "" : process.argv[index + 1]);
console.log(await createPrivateCompletionPage(directory, await readDeliveryRecords(directory)));
