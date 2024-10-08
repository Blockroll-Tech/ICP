import { Principal } from '@dfinity/principal';
import { AccountIdentifier } from '@dfinity/ledger-icp';
import { Ed25519KeyIdentity } from '@dfinity/identity';
import { HttpAgent, Actor, SignIdentity } from '@dfinity/agent';
import { IDL } from '@dfinity/candid';
import http from '../../config/http';
import icpModel from './icp.model';
import transactionModel from '../transaction/transaction.model';
import workerManager from '../../workers/worker.manager';
import logger from '../../config/logger';

const encryption_workers = workerManager;
class IcpService {
    private readonly host: string = 'https://ic0.app';
    private readonly ledgerCanisterId: string = 'xevnm-gaaaa-aaaar-qafnq-cai';
    private readonly indexCanisterId: string = 'xrs4b-hiaaa-aaaar-qafoa-cai';
    private agent: HttpAgent;
    private ckUSDC: any;

    constructor(identity?: SignIdentity) {
        this.agent = new HttpAgent({ host: this.host, identity });
        this.ckUSDC = this.createActor(this.ledgerCanisterId, this.getCkUSDCIDL(),this.agent);
    }

    private createActor(canisterId: string, idl: IDL.InterfaceFactory,agent: HttpAgent): any {
        return Actor.createActor(idl, {
            agent: agent,
            canisterId,
        });
    }

    public async generateWallet(user: string): Promise<{
        principal: string;
        accountIdentifier: string;
        publicKey: string;
    }> {
        const identity = await Ed25519KeyIdentity.generate();
        const principal = identity.getPrincipal();
        const accountIdentifier = AccountIdentifier.fromPrincipal({ principal });
        const publicKey = identity.getPublicKey().toDer();
        const privateKey = identity.getKeyPair().secretKey;
        const encryptedKey = await encryption_workers.addTask('encrypt', Buffer.from(privateKey).toString('hex'));
        await icpModel.create({
            public_key: Buffer.from(publicKey).toString('hex'),
            private_key: encryptedKey,
            user: user,
            principal: principal.toText(),
            account_identifier: accountIdentifier.toHex(),
        });

        return {
            principal: principal.toText(),
            accountIdentifier: accountIdentifier.toHex(),
            publicKey: Buffer.from(publicKey).toString('hex'),
        };
    }

    public async getCkUSDCBalance(principal: string, subaccount?: Uint8Array): Promise<bigint> {
        try {
            const owner = Principal.fromText(principal);
            const subaccountVec = subaccount ? [Array.from(subaccount)] : [];
            const balance = await this.ckUSDC.icrc1_balance_of({
                owner,
                subaccount: subaccountVec,
            });
            return balance;
        } catch (error) {
            //console.error('Error fetching CKUSDC balance:', error);
            throw error;
        }
    }

    public async transferCkUSDC(
        privateKeyHex: string,
        toPrincipal: string,
        amount: bigint,
        memo?: Uint8Array,
        createdAtTime?: bigint,
    ): Promise<bigint> {
        try {
            const fromIdentity = this.createIdentityFromPrivateKey(privateKeyHex);
            const senderAgent = new HttpAgent({ host: this.host, identity: fromIdentity });
            await senderAgent.fetchRootKey();
            const senderCkUSDC = this.createActor(this.ledgerCanisterId, this.getCkUSDCIDL(), senderAgent);

            const toAccount = {
                owner: Principal.fromText(toPrincipal),
                subaccount: [],
            };

            const transferArg = {
                to: toAccount,
                fee: [],
                memo: memo ? [Array.from(memo)] : [],
                from_subaccount: [],
                created_at_time: createdAtTime ? [createdAtTime] : [],
                amount,
            };

            const result = await senderCkUSDC.icrc1_transfer(transferArg);

            if ('Err' in result) {
                const serializedError = this.serializeBigIntError(result.Err);
                throw new Error(`Transfer failed: ${JSON.stringify(serializedError)}`);
            }

            console.log('Transfer successful:', result.Ok.toString(),result);
            return result.Ok;
        } catch (error) {
            logger.error('Error transferring CKUSDC:', error);
            throw error;
        }
    }

    private serializeBigIntError(error: any): any {
        if (typeof error === 'bigint') {
            return error.toString();
        } else if (typeof error === 'object' && error !== null) {
            const serialized: any = {};
            for (const [key, value] of Object.entries(error)) {
                serialized[key] = this.serializeBigIntError(value);
            }
            return serialized;
        } else {
            return error;
        }
    }

    public async getLatestTx(account_identifier: string, user: string) {
        try {
            let result = await http.get(
                `https://icrc-api.internetcomputer.org/api/v1/ledgers/xevnm-gaaaa-aaaar-qafnq-cai/accounts/${account_identifier}/transactions?limit=0`,
            );
            let json = await result.json();
            console.log(json);
            
            let total_on_icp = json.total_transactions ?? 0;
            let total_on_our_db = await transactionModel.countDocuments({ user: user, type: 'CKUSDC' });
            console.log(total_on_our_db);
            
            if (total_on_icp === total_on_our_db) {
                console.log("here");
                
                return;
            } else {
                console.log("keep up");
                
                let res = await this.getTransactionHistoryWithPagination(
                    account_identifier,
                    total_on_icp - total_on_our_db,
                    total_on_our_db ==0 ? 0 : total_on_our_db + 1,
                );
                console.log(res);
                
                const processedTransactions = res?.data?.map((tx: any) => ({
                    type: 'CKUSDC', // or set dynamically if you have different types
                    user: user, // you need to assign this if the user is known
                    status: 'SUCCESS', // default status
                    mode: tx.from_account === account_identifier ? 'DEBIT' : 'CREDIT',
                    amount: tx.amount / 1000000,
                    fee: tx.fee / 1000000,
                    from: tx.from_account,
                    to: tx.to_account,
                    index: tx.index,
                }));
                await transactionModel.insertMany(processedTransactions);
            }
        } catch (error) {
            //console.error('Error fetching transaction history with pagination:', error);
            throw error;
        }
    }
    async getTransactionHistoryWithPagination(
        accountIdentifier: string,
        limit: number,
        startOption?: number,
    ): Promise<any> {
        let max = 0;
        try {
            let result = await http.get(
                `https://icrc-api.internetcomputer.org/api/v1/ledgers/xevnm-gaaaa-aaaar-qafnq-cai/accounts/${accountIdentifier}/transactions?max_transaction_index=${max}&offset=${startOption}&limit=${limit}`,
            );
            let json = result.json();
            return json;
        } catch (error) {
            //console.error('Error fetching transaction history with pagination:', error);
            throw error;
        }
    }

    // Helper method to convert AccountIdentifier to Principal
    private convertAccountIdentifierToPrincipal(accountIdentifier: string): Principal {
        try {
            // Decode the accountIdentifier from Hex to bytes
            const bytes = Buffer.from(accountIdentifier, 'hex');

            // Convert bytes to a Principal
            return Principal.fromUint8Array(new Uint8Array(bytes));
        } catch (error) {
            //console.error('Error converting AccountIdentifier to Principal:', error);
            throw new Error('Invalid account identifier format.');
        }
    }

    public createIdentityFromPrivateKey(privateKeyHex: string): SignIdentity {
        return Ed25519KeyIdentity.fromSecretKey(Buffer.from(privateKeyHex, 'hex'));
    }

    private getCkUSDCIDL(): IDL.InterfaceFactory {
        return ({ IDL }) => {
            const TransferError = IDL.Variant({
                BadFee: IDL.Record({ expected_fee: IDL.Nat }),
                BadBurn: IDL.Record({ min_burn_amount: IDL.Nat }),
                InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
                TooOld: IDL.Null,
                CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
                TemporarilyUnavailable: IDL.Null,
                Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
                GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text }),
            });

            return IDL.Service({
                icrc1_balance_of: IDL.Func(
                    [IDL.Record({ owner: IDL.Principal, subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)) })],
                    [IDL.Nat],
                    ['query'],
                ),
                icrc1_transfer: IDL.Func(
                    [
                        IDL.Record({
                            to: IDL.Record({ owner: IDL.Principal, subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)) }),
                            fee: IDL.Opt(IDL.Nat),
                            memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
                            from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
                            created_at_time: IDL.Opt(IDL.Nat64),
                            amount: IDL.Nat,
                        }),
                    ],
                    [IDL.Variant({ Ok: IDL.Nat, Err: TransferError })],
                    [],
                ),
            });
        };
    }

    private getIndexIDL(): IDL.InterfaceFactory {
        return ({ IDL }) =>
            IDL.Service({
                get_account_transactions: IDL.Func(
                    [
                        IDL.Record({
                            account: IDL.Record({
                                owner: IDL.Principal,
                                subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)), // Optional subaccount blob
                            }),
                            start: IDL.Opt(IDL.Nat64),
                            length: IDL.Opt(IDL.Nat64),
                            max_results: IDL.Nat64, // max_results should be a nat, not an optional
                        }),
                    ],
                    [
                        IDL.Variant({
                            Ok: IDL.Vec(
                                IDL.Record({
                                    timestamp: IDL.Nat64,
                                    transfer: IDL.Record({
                                        from: IDL.Vec(IDL.Nat8),
                                        to: IDL.Vec(IDL.Nat8),
                                        amount: IDL.Nat64,
                                        fee: IDL.Nat64,
                                    }),
                                }),
                            ),
                            Err: IDL.Text,
                        }),
                    ],
                    ['query'],
                ),
            });
    }

    public getLedgerCanisterId(): string {
        return this.ledgerCanisterId;
    }

    public getIndexCanisterId(): string {
        return this.indexCanisterId;
    }

    public async getTransactionByid(id:number){
        let result = await http.get(
            `https://icrc-api.internetcomputer.org/api/v1/ledgers/xevnm-gaaaa-aaaar-qafnq-cai/transactions/${id}`,
        );
        let json = await result.json();
        return json;
    }
}

export default IcpService;
