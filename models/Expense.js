import mongoose, { Schema, SchemaType, model } from "mongoose";

const ExpenseSchema = new Schema(
    {
        amount: {
            type: Number,
            require: true
        },
        category: {
            type: String,
            enum: ['food', 'utilities', 'bills', 'miscellenous']
        },
        userId: {
            type: Schema.Types.ObjectId, ref: 'User'}     
    },
    {
        timestamps: true
    }
)

const ExpenseModel = model('Expense', ExpenseSchema)

export default ExpenseModel