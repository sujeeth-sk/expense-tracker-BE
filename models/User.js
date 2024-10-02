import { Schema, model } from "mongoose";

const UserSchema = new Schema(
    {
        username: {
            type: String,
            require: true,
            unique: true,
        },
        password: {
            type: String,
            require: true,
        }
    },{
        timestamps: true
    }
)
const UserModel = model('User', UserSchema)

export default UserModel