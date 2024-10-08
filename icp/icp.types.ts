import { Document } from 'mongoose';

export interface icpDTO {
    _id?: string;
    public_key: string;
    private_key: string;
    balance: number;
    principal: string;
    account_identifier: string;
    gas_balance: number;
    user?: string;
}

export interface ICIRCLEDocument extends Document {
    public_key: string;
    private_key: string;
    balance: number;
    principal: string;
    account_identifier: string;
    gas_balance: number;
    user?: string;
}
