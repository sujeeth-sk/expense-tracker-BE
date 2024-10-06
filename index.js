import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken'
import cookieParser from 'cookie-parser';
import { mongoDB_URI, PORT } from './secrets.js';
import ExpenseModel from './models/Expense.js';
import UserModel from './models/User.js';
import BudgetModel from './models/Budget.js';

const app = express();
const secretSalt = "91745eaif94q8rhiwfaAIOFUH2487#()@&*"

app.use(cors()) 
app.use(express.json())

mongoose
    .connect(mongoDB_URI)
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.error("Error connecting to mongo DB: ", err))

app.post('/register', async (req, res) => {
    const { password, username} = req.body;
    console.log({ password, username})
    try {
        const userDoc = await UserModel.create({
            username,
            password
        })
        if(userDoc) {
            jwt.sign({ username, id: userDoc._id }, secretSalt, {}, (err, token) => {
                if (err) throw err;
                res.cookie("token", token).json({
                  id: userDoc._id,
                  username,
                });
              });
        }
        res.json({ok:true})
    } catch (error) {
        console.error(error)
        res.status(400).json(error)
    }
})

app.post('/login', async (req,res) => {
    const {username, password} = req.body;
    try {
        const userDoc = await UserModel.findOne({username})
        const passOk = JSON.stringify(password) == JSON.stringify(userDoc.password)
        if(passOk){
            console.log('okokok')
            jwt.sign({ username, id: userDoc._id }, secretSalt, {}, (err, token) => {
                if (err) throw err;
                res.cookie("token", token).json({
                  id: userDoc._id,
                  username,
                });
              });
            res.json({ok: true})
        } else {
            res.json("invalid password")
        }
    } catch (error) {
        console.error(error, "shit man")
        res.status(400).json(error)
    }
})


app.post('/add', async (req, res) => {
    const {amount, category} = req.body
    try {
        const expenseDoc = await ExpenseModel.create({
            amount, 
            category
        })
        res.json(expenseDoc) 
    } catch (error) {
        console.error(error)
        res.status(400).json(error)
    }
})

app.get('/view', async (req, res) => {
    try {
        
        const viewAll = await ExpenseModel.find()
            // .populate('user', ['username'])
        res.json(viewAll)
    } catch (error) {
        console.error(error)
        res.status(400).json(error)
    }
})

app.listen(PORT, (req, res) => {
    console.log(`Running on port: ${PORT}`) 
})