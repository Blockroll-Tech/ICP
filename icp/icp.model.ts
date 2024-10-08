import mongoose, { Schema, Model } from 'mongoose';

import { ICIRCLEDocument, icpDTO } from './icp.types';

interface IIcp extends ICIRCLEDocument {}

interface IIcpModel extends Model<IIcp> {}

const IcpSchema = new Schema<IIcp, IIcpModel>(
    {
        public_key: {
            type: String,
            required: true,
            unique: true,
        },
        private_key: {
            type: String,
            required: true,
            unique: true,
        },
        principal: {
            type: String,
            required: true,
            unique: true,
        },
        account_identifier: {
            type: String,
            required: true,
            unique: true,
        },
        balance: {
            type: Number,
            default: 0,
        },
        gas_balance: {
            type: Number,
            default: 0,
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: true,
    },
);

// Export the model and return your IUser interface
export default mongoose.model<IIcp, IIcpModel>('Icp', IcpSchema);
