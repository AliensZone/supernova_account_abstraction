import {
	hexConcat, hexDataSlice,
	hexlify,
	hexZeroPad,
	Interface,
	keccak256,
	defaultAbiCoder
} from 'ethers/lib/utils'
import { Contract, BigNumberish, BigNumber } from "ethers";
import { BytesLike, Hexable } from '@ethersproject/bytes'
import { PackedUserOperation, UserOperation } from '../types/UserOperation'

import { ethers } from 'hardhat'

const panicCodes: { [key: number]: string } = {
	// from https://docs.soliditylang.org/en/v0.8.0/control-structures.html
	0x01: 'assert(false)',
	0x11: 'arithmetic overflow/underflow',
	0x12: 'divide by zero',
	0x21: 'invalid enum value',
	0x22: 'storage byte array that is incorrectly encoded',
	0x31: '.pop() on an empty array.',
	0x32: 'array out-of-bounds or negative index',
	0x41: 'memory overflow',
	0x51: 'zero-initialized variable of internal function type'
}

export const DefaultsForUserOp: UserOperation = {
	sender: ethers.constants.AddressZero,
	nonce: 0,
	initCode: '0x',
	callData: '0x',
	callGasLimit: 0,
	verificationGasLimit: 150000, // default verification gas. will add create2 cost (3200+200*length) if initCode exists
	preVerificationGas: 21000, // should also cover calldata cost.
	maxFeePerGas: 0,
	maxPriorityFeePerGas: 1e9,
	paymaster: ethers.constants.AddressZero,
	paymasterData: '0x',
	paymasterVerificationGasLimit: 3e5,
	paymasterPostOpGasLimit: 0,
	signature: '0x'
}

// helper function to create the initCode to deploy the account, using our account factory.
export function getAccountInitCode(owner: string, factory: Contract, salt = 0): BytesLike {
	return hexConcat([
		factory.address,
		factory.interface.encodeFunctionData('createAccount', [owner, salt])
	])
}

export async function fillAndPack(op: Partial<UserOperation>, entryPoint?: Contract, getNonceFunction = 'getNonce'): Promise<PackedUserOperation> {
	return packUserOp(await fillUserOp(op, entryPoint, getNonceFunction))
}

// helper to fill structure:
// - default callGasLimit to estimate call from entryPoint to account (TODO: add overhead)
// if there is initCode:
//  - calculate sender by eth_call the deployment code
//  - default verificationGasLimit estimateGas of deployment code plus default 100000
// no initCode:
//  - update nonce from account.getNonce()
// entryPoint param is only required to fill in "sender address when specifying "initCode"
// nonce: assume contract as "getNonce()" function, and fill in.
// sender - only in case of construction: fill sender from initCode.
// callGasLimit: VERY crude estimation (by estimating call to account, and add rough entryPoint overhead
// verificationGasLimit: hard-code default at 100k. should add "create2" cost
export async function fillUserOp(op: Partial<UserOperation>, entryPoint?: Contract, getNonceFunction = 'getNonce'): Promise<UserOperation> {
	const op1 = { ...op }
	const provider = entryPoint?.provider
	if (op.initCode != null) {
		const initAddr = hexDataSlice(op1.initCode!, 0, 20)
		const initCallData = hexDataSlice(op1.initCode!, 20)
		if (op1.nonce == null) op1.nonce = 0
		if (op1.verificationGasLimit == null) {
			if (provider == null) throw new Error('no entrypoint/provider')
			const initEstimate = await provider.estimateGas({
				from: entryPoint?.address,
				to: initAddr,
				data: initCallData,
				gasLimit: 10e6
			})
			op1.verificationGasLimit = BigNumber.from(DefaultsForUserOp.verificationGasLimit).add(initEstimate)
		}
	}
	if (op1.nonce == null) {
		if (provider == null) throw new Error('must have entryPoint to autofill nonce')
		const c = new Contract(op.sender!, [`function ${getNonceFunction}() view returns(uint256)`], provider)
		op1.nonce = await c[getNonceFunction]().catch(rethrow())
	}
	if (op1.callGasLimit == null && op.callData != null) {
		if (provider == null) throw new Error('must have entryPoint for callGasLimit estimate')
		const gasEstimated = await provider.estimateGas({
			from: entryPoint?.address,
			to: op1.sender,
			data: op1.callData
		})

		// estimateGas assumes direct call from entryPoint. add wrapper cost.
		op1.callGasLimit = gasEstimated //.add(55000)
	}
	if (op1.paymaster != null) {
		if (op1.paymasterVerificationGasLimit == null) {
			op1.paymasterVerificationGasLimit = DefaultsForUserOp.paymasterVerificationGasLimit
		}
		if (op1.paymasterPostOpGasLimit == null) {
			op1.paymasterPostOpGasLimit = DefaultsForUserOp.paymasterPostOpGasLimit
		}
	}
	if (op1.maxFeePerGas == null) {
		if (provider == null) throw new Error('must have entryPoint to autofill maxFeePerGas')
		const block = await provider.getBlock('latest')
		op1.maxFeePerGas = block.baseFeePerGas!.add(op1.maxPriorityFeePerGas ?? DefaultsForUserOp.maxPriorityFeePerGas)
	}
	// TODO: this is exactly what fillUserOp below should do - but it doesn't.
	// adding this manually
	if (op1.maxPriorityFeePerGas == null) {
		op1.maxPriorityFeePerGas = DefaultsForUserOp.maxPriorityFeePerGas
	}
	const op2 = fillUserOpDefaults(op1)
	// eslint-disable-next-line @typescript-eslint/no-base-to-string
	if (op2.preVerificationGas.toString() === '0') {
		// TODO: we don't add overhead, which is ~21000 for a single TX, but much lower in a batch.
		op2.preVerificationGas = callDataCost(encodeUserOp(op2, false))
	}
	return op2
}

export function packUserOp(userOp: UserOperation): PackedUserOperation {
	const accountGasLimits = packAccountGasLimits(userOp.verificationGasLimit, userOp.callGasLimit)
	const gasFees = packAccountGasLimits(userOp.maxPriorityFeePerGas, userOp.maxFeePerGas)
	let paymasterAndData = '0x'
	if (userOp.paymaster?.length >= 20 && userOp.paymaster !== ethers.constants.AddressZero) {
		paymasterAndData = packPaymasterData(userOp.paymaster as string, userOp.paymasterVerificationGasLimit, userOp.paymasterPostOpGasLimit, userOp.paymasterData as string)
	}
	return {
		sender: userOp.sender,
		nonce: userOp.nonce,
		callData: userOp.callData,
		accountGasLimits,
		initCode: userOp.initCode,
		preVerificationGas: userOp.preVerificationGas,
		gasFees,
		paymasterAndData,
		signature: userOp.signature
	}
}
// rethrow "cleaned up" exception.
// - stack trace goes back to method (or catch) line, not inner provider
// - attempt to parse revert data (needed for geth)
// use with ".catch(rethrow())", so that current source file/line is meaningful.
export function rethrow(): (e: Error) => void {
	const callerStack = new Error().stack!.replace(/Error.*\n.*at.*\n/, '').replace(/.*at.* \(internal[\s\S]*/, '')

	if (arguments[0] != null) {
		throw new Error('must use .catch(rethrow()), and NOT .catch(rethrow)')
	}
	return function (e: Error) {
		const solstack = e.stack!.match(/((?:.* at .*\.sol.*\n)+)/)
		const stack = (solstack != null ? solstack[1] : '') + callerStack
		// const regex = new RegExp('error=.*"data":"(.*?)"').compile()
		const found = /error=.*?"data":"(.*?)"/.exec(e.message)
		let message: string
		if (found != null) {
			const data = found[1]
			message = decodeRevertReason(data) ?? e.message + ' - ' + data.slice(0, 100)
		} else {
			message = e.message
		}
		const err = new Error(message)
		err.stack = 'Error: ' + message + '\n' + stack
		throw err
	}
}

export function fillUserOpDefaults(op: Partial<UserOperation>, defaults = DefaultsForUserOp): UserOperation {
	const partial: any = { ...op }
	// we want "item:undefined" to be used from defaults, and not override defaults, so we must explicitly
	// remove those so "merge" will succeed.
	for (const key in partial) {
		if (partial[key] == null) {
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete partial[key]
		}
	}
	const filled = { ...defaults, ...partial }
	return filled
}

export function encodeUserOpSupernova(userOp: UserOperation, forSignature = true): string {
	const packedUserOp = packUserOp(userOp)
	if (forSignature) {
		return defaultAbiCoder.encode(
			['address', 'uint256', 'bytes32', 'bytes32'],
			[packedUserOp.sender, packedUserOp.nonce, keccak256(packedUserOp.initCode), keccak256(packedUserOp.callData)])
	} else {
		// for the purpose of calculating gas cost encode also signature (and no keccak of bytes)
		return defaultAbiCoder.encode(
			['address', 'uint256', 'bytes', 'bytes', 'bytes'],
			[packedUserOp.sender, packedUserOp.nonce, packedUserOp.initCode, packedUserOp.callData, packedUserOp.signature])
	}
}

export function encodeUserOp(userOp: UserOperation, forSignature = true): string {
	const packedUserOp = packUserOp(userOp)
	if (forSignature) {
		return defaultAbiCoder.encode(
			['address', 'uint256', 'bytes32', 'bytes32',
				'bytes32', 'uint256', 'bytes32',
				'bytes32'],
			[packedUserOp.sender, packedUserOp.nonce, keccak256(packedUserOp.initCode), keccak256(packedUserOp.callData),
			packedUserOp.accountGasLimits, packedUserOp.preVerificationGas, packedUserOp.gasFees,
			keccak256(packedUserOp.paymasterAndData)])
	} else {
		// for the purpose of calculating gas cost encode also signature (and no keccak of bytes)
		return defaultAbiCoder.encode(
			['address', 'uint256', 'bytes', 'bytes',
				'bytes32', 'uint256', 'bytes32',
				'bytes', 'bytes'],
			[packedUserOp.sender, packedUserOp.nonce, packedUserOp.initCode, packedUserOp.callData,
			packedUserOp.accountGasLimits, packedUserOp.preVerificationGas, packedUserOp.gasFees,
			packedUserOp.paymasterAndData, packedUserOp.signature])
	}
}

export function callDataCost(data: string): number {
	return ethers.utils.arrayify(data)
		.map(x => x === 0 ? 4 : 16)
		.reduce((sum, x) => sum + x)
}

export function packAccountGasLimits(verificationGasLimit: BigNumberish, callGasLimit: BigNumberish): string {
	return ethers.utils.hexConcat([
		hexZeroPad(hexlify(verificationGasLimit, { hexPad: 'left' }), 16), hexZeroPad(hexlify(callGasLimit, { hexPad: 'left' }), 16)
	])
}

export function packPaymasterData(paymaster: string, paymasterVerificationGasLimit: BytesLike | Hexable | number | bigint, postOpGasLimit: BytesLike | Hexable | number | bigint, paymasterData: string): string {
	return ethers.utils.hexConcat([
		paymaster, hexZeroPad(hexlify(paymasterVerificationGasLimit, { hexPad: 'left' }), 16),
		hexZeroPad(hexlify(postOpGasLimit, { hexPad: 'left' }), 16), paymasterData
	])
}

export function decodeRevertReason(data: string | Error, nullIfNoMatch = true): string | null {
	if (typeof data !== 'string') {
		const err = data as any
		data = (err.data ?? err.error?.data) as string
		if (typeof data !== 'string') throw err
	}

	const methodSig = data.slice(0, 10)
	const dataParams = '0x' + data.slice(10)

	// can't add Error(string) to xface...
	if (methodSig === '0x08c379a0') {
		const [err] = ethers.utils.defaultAbiCoder.decode(['string'], dataParams)
		// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
		return `Error(${err})`
	} else if (methodSig === '0x4e487b71') {
		const [code] = ethers.utils.defaultAbiCoder.decode(['uint256'], dataParams)
		return `Panic(${panicCodes[code] ?? code} + ')`
	}

	try {
		const err = decodeRevertReasonContracts.parseError(data)
		// treat any error "bytes" argument as possible error to decode (e.g. FailedOpWithRevert, PostOpReverted)
		const args = err.args.map((arg: any, index) => {
			switch (err.errorFragment.inputs[index].type) {
				case 'bytes': return decodeRevertReason(arg)
				case 'string': return `"${(arg as string)}"`
				default: return arg
			}
		})
		return `${err.name}(${args.join(',')})`
	} catch (e) {
		// throw new Error('unsupported errorSig ' + data)
		if (!nullIfNoMatch) {
			return data
		}
		return null
	}
}

const decodeRevertReasonContracts = new Interface([
	// ...EntryPoint__factory.createInterface().fragments,
	// ...TestPaymasterRevertCustomError__factory.createInterface().fragments,
	// ...TestERC20__factory.createInterface().fragments, // for OZ errors,
	'error ECDSAInvalidSignature()'
]) // .filter(f => f.type === 'error'))


export function getUserOpHash(op: UserOperation, entryPoint: string, chainId: number): string {
	const userOpHash = keccak256(encodeUserOp(op, true))
	return userOpHash
}

export function getUserOpHashSupernova(op: UserOperation): string {
	const userOpHash = keccak256(encodeUserOpSupernova(op, true))
	return userOpHash
}
