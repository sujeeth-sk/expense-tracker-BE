import mongoose, { Schema, model } from "mongoose";

const BudgetSchema = new Schema(
  {
    budget: {
      type: Number,
      require: true,
    },
    spent: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

const BudgetModel = model('budget', BudgetSchema)
export default BudgetModel