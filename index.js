console.clear();
require("dotenv").config();
const {
	Client,
	AccountId,
	PrivateKey,
	TokenCreateTransaction,
	FileCreateTransaction,
	FileAppendTransaction,
	ContractCreateTransaction,
	ContractFunctionParameters,
	TokenUpdateTransaction,
	ContractExecuteTransaction,
	TokenInfoQuery,
	AccountBalanceQuery,
} = require("@hashgraph/sdk");
const fs = require("fs");

const operatorId = AccountId.fromString(process.env.OPERATOR_ID);
const operatorKey = PrivateKey.fromString(process.env.OPERATOR_PVKEY);
const treasuryId = AccountId.fromString(process.env.TREASURY_ID);
const treasuryKey = PrivateKey.fromString(process.env.TREASURY_PVKEY);
const aliceId = AccountId.fromString(process.env.ALICE_ID);
const aliceyKey = PrivateKey.fromString(process.env.ALICE_PVKEY);

const client = Client.forPreviewnet().setOperator(operatorId, operatorKey);

async function main() {
	//create token
	const tokenCreateTx = await new TokenCreateTransaction()
		.setTokenName("testToken")
		.setTokenSymbol("TT")
		.setDecimals(0)
		.setInitialSupply(100)
		.setTreasuryAccountId(treasuryId)
		.setAdminKey(treasuryKey)
		.setSupplyKey(treasuryKey)
		.freezeWith(client)
		.sign(treasuryKey);
	const tokenCreateSubmit = await tokenCreateTx.execute(client);
	const tokenCreateRx = await tokenCreateSubmit.getReceipt(client);
	const tokenId = tokenCreateRx.tokenId;
	const tokenAddressSol = tokenId.toSolidityAddress();

	console.log(`- Token ID: ${tokenId} \n`);
	console.log(`- Token address: ${tokenAddressSol} \n`);

	// Token query
	var tokenInfo = await new TokenInfoQuery().setTokenId(tokenId).execute(client);
	console.log(`- Token supply: ${tokenInfo.totalSupply.low} \n`);

	//Create a file on Hedera and store the hex-encoded bytecode
	const bytecode = fs.readFileSync("./MintAssociateTransferHTS_sol_myContract.bin");

	const fileCreateTx = new FileCreateTransaction().setKeys([operatorKey]);
	const fileSubmit = await fileCreateTx.execute(client);
	const fileCreateRx = await fileSubmit.getReceipt(client);
	const bytecodeFileId = fileCreateRx.fileId;
	console.log(`- The smart contract byte code file ID is: ${bytecodeFileId} \n`);

	const fileAppendTx = new FileAppendTransaction().setFileId(bytecodeFileId).setContents(bytecode).setMaxChunks(10);
	const fileAppendSubmit = await fileAppendTx.execute(client);
	const fileAppendRx = await fileAppendSubmit.getReceipt(client);
	console.log(`- Content added: ${fileAppendRx.status} \n`);

	// Instantiate the contract
	const contractInstantiateTx = new ContractCreateTransaction()
		.setBytecodeFileId(bytecodeFileId)
		.setGas(3000000)
		.setConstructorParameters(new ContractFunctionParameters().addAddress(tokenAddressSol));
	const contractInstantiateSubmit = await contractInstantiateTx.execute(client);
	const contractInstantiateRx = await contractInstantiateSubmit.getReceipt(client);
	const contractId = contractInstantiateRx.contractId;
	const contractAddress = contractId.toSolidityAddress();

	console.log(`- The smart contract ID is: ${contractId} \n`);
	console.log(`- The smart contract address is: ${contractAddress} \n`);

	// // Update the token to be managed by SC
	const tokenUpdateTx = await new TokenUpdateTransaction()
		.setTokenId(tokenId)
		.setSupplyKey(contractId)
		.freezeWith(client)
		.sign(treasuryKey);
	const tokenUpdateSubmit = await tokenUpdateTx.execute(client);
	const tokenUpdateRx = await tokenUpdateSubmit.getReceipt(client);
	console.log(`- Token update status: ${tokenUpdateRx.status} \n`);

	//Create the transaction to update the contract state variables
	const contractExecTx = await new ContractExecuteTransaction()
		.setContractId(contractId)
		.setGas(3000000)
		.setFunction("mintFungibleToken", new ContractFunctionParameters().addUint64(150))
		.freezeWith(client);
	const contractExecSubmit = await contractExecTx.execute(client);
	const contractExecRx = await contractExecSubmit.getReceipt(client);

	console.log(`- New tokens minted: ${contractExecRx.status.toString()} \n`);

	// Token query
	var tokenInfo = await new TokenInfoQuery().setTokenId(tokenId).execute(client);
	console.log(`- Token supply: ${tokenInfo.totalSupply.low} \n`);

	// ==========================
	//Create the transaction to update the contract state variables
	const contractExecTx1 = await new ContractExecuteTransaction()
		.setContractId(contractId)
		.setGas(3000000)
		.setFunction("tokenAssociate", new ContractFunctionParameters().addAddress(aliceId.toSolidityAddress()))
		.freezeWith(client);
	const contractExecSign1 = await contractExecTx1.sign(aliceyKey);
	const contractExecSubmit1 = await contractExecSign1.execute(client);
	const contractExecRx1 = await contractExecSubmit1.getReceipt(client);

	console.log(`- Alice's association: ${contractExecRx1.status.toString()} \n`);

	// // ==========================
	// //Create the transaction to update the contract state variables
	const contractExecTx2 = await new ContractExecuteTransaction()
		.setContractId(contractId)
		.setGas(3000000)
		.setFunction(
			"tokenTransfer",
			new ContractFunctionParameters()
				.addAddress(treasuryId.toSolidityAddress())
				.addAddress(aliceId.toSolidityAddress())
				.addInt64(50)
		)
		.freezeWith(client);

	const contractExecSign2 = await contractExecTx2.sign(treasuryKey);
	const contractExecSubmit2 = await contractExecSign2.execute(client);
	const contractExecRx2 = await contractExecSubmit2.getReceipt(client);

	console.log(`- Token transfer from Treasury to Alice: ${contractExecRx2.status.toString()} \n`);

	const accountQuery = await new AccountBalanceQuery().setAccountId(aliceId).execute(client);
	const tBalance = accountQuery.tokens._map.get(tokenId.toString());
	console.log(`- Alices's token balance: ${tBalance} \n`);
}
main();
