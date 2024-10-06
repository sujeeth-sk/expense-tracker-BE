import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, PutItemCommand, GetItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { PORT, SECRET_SALT, REGION, TABLE_NAMES, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } from './secrets.js'; // placeholder for your secrets

// import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const dbClient = new DynamoDBClient({
  region: REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});


const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// const dbClient = new DynamoDBClient({ region: REGION });

// Create tables if they don't exist
async function createTableIfNotExists(tableName, schema) {
    try {
        await dbClient.send(new DescribeTableCommand({ TableName: tableName }));
        console.log(`Table ${tableName} exists.`);
    } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
            console.log(`Creating table ${tableName}...`);
            await dbClient.send(new CreateTableCommand(schema));
            console.log(`Table ${tableName} created.`);
        } else {
            console.error("Error checking table existence: ", error);
        }
    }
}

// Define schemas for your DynamoDB tables
const expenseSchema = {
    TableName: TABLE_NAMES.expenses,
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5,
    },
};

const userSchema = {
    TableName: TABLE_NAMES.users,
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5,
    },
};

const budgetSchema = {
    TableName: TABLE_NAMES.budgets,
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5, 
    },
};

// Create tables if they don't exist
async function setupDynamoTables() {
    await createTableIfNotExists(TABLE_NAMES.expenses, expenseSchema);
    await createTableIfNotExists(TABLE_NAMES.users, userSchema);
    await createTableIfNotExists(TABLE_NAMES.budgets, budgetSchema);
}

// JWT secret key for signing tokens (placeholder in your `secrets.js`)
const secretSalt = SECRET_SALT;

// Register endpoint
app.post('/register', async (req, res) => {
    const { password, username } = req.body;
    const userId = uuidv4();

    const params = {
        TableName: TABLE_NAMES.users,
        Item: {
            id: { S: userId },
            username: { S: username },
            password: { S: password },
        },
    };

    try {
        await dbClient.send(new PutItemCommand(params));
        jwt.sign({ username, id: userId }, secretSalt, {}, (err, token) => {
            if (err) throw err;
            res.cookie('token', token).json({ id: userId, username });
        });
    } catch (error) {
        console.error(error);
        res.status(400).json(error);
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    const params = {
        TableName: TABLE_NAMES.users,
        Key: {
            id: { S: username },
        },
    };

    try {
        const { Item } = await dbClient.send(new GetItemCommand(params));
        const passOk = Item && password === Item.password.S;

        if (passOk) {
            jwt.sign({ username, id: Item.id.S }, secretSalt, {}, (err, token) => {
                if (err) throw err;
                res.cookie('token', token).json({ id: Item.id.S, username });
            });
        } else {
            res.json("Invalid password");
        }
    } catch (error) {
        console.error(error);
        res.status(400).json(error);
    }
});

// Add Expense endpoint
app.post('/add', async (req, res) => {
    const { amount, category } = req.body;
    const expenseId = uuidv4();

    const params = {
        TableName: TABLE_NAMES.expenses,
        Item: {
            id: { S: expenseId },
            amount: { N: amount.toString() },
            category: { S: category },
        },
    };

    try {
        await dbClient.send(new PutItemCommand(params));
        res.json({ id: expenseId, amount, category });
    } catch (error) {
        console.error(error);
        res.status(400).json(error);
    }
});

// View all expenses
app.get('/view', async (req, res) => {
    const params = {
        TableName: TABLE_NAMES.expenses,
    };

    try {
        const data = await dbClient.send(new ScanCommand(params));
        const expenses = data.Items.map(item => ({
            id: item.id.S,
            amount: item.amount.N,
            category: item.category.S,
        }));
        res.json(expenses);
    } catch (error) {
        console.error(error);
        res.status(400).json(error);
    }
});

// Start the server and initialize DynamoDB tables
app.listen(PORT, async () => {
    console.log(`Running on port: ${PORT}`);
    await setupDynamoTables();
});
