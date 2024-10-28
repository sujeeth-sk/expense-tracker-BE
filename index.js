import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, PutItemCommand, GetItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Initialize DynamoDB Client
const dbClient = new DynamoDBClient({
  region: process.env.REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

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

// Define updated schema for Expenses table (with userId, timestamp)
const expenseSchema = {
    TableName: process.env.TABLE_NAMES_EXPENSES,
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5,
    },
};

const userSchema = {
    TableName: process.env.TABLE_NAMES_USERS, // Use environment variable for table name
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5,
    },
};

// Remove budgetSchema since it's unused
// async function createTableIfNotExists(process.env.TABLE_NAMES_BUDGETS, budgetSchema) {}

async function setupDynamoTables() {
    await createTableIfNotExists(process.env.TABLE_NAMES_EXPENSES, expenseSchema);
    await createTableIfNotExists(process.env.TABLE_NAMES_USERS, userSchema);
}

// JWT secret key
const secretSalt = process.env.SECRET_SALT;

// Middleware to verify JWT and extract user ID
function authenticateJWT(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    jwt.verify(token, secretSalt, (err, decoded) => {
        if (err) return res.status(403).json({ error: "Forbidden" });
        req.user = decoded; // Attach user info to the request
        next();
    });
}

// Register endpoint
// Register endpoint
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    const params = {
        TableName: process.env.TABLE_NAMES_USERS,
        Item: {
            id: { S: username }, // Use username as the unique identifier
            username: { S: username },
            password: { S: password }, // Store the plain text password (in real cases, hash it)
        },
    };

    try {
        // Check if the user already exists
        const getParams = {
            TableName: process.env.TABLE_NAMES_USERS,
            Key: {
                id: { S: username },
            },
        };

        const existingUser = await dbClient.send(new GetItemCommand(getParams));
        if (existingUser.Item) {
            return res.status(400).json({ message: "Username already exists" });
        }

        // If the user does not exist, create a new user
        await dbClient.send(new PutItemCommand(params));

        // Sign the JWT token
        jwt.sign({ username, id: username }, secretSalt, {}, (err, token) => {
            if (err) {
                console.error("JWT signing error:", err);
                return res.status(500).json({ error: "JWT signing failed" });
            }

            // Set the cookie and send the response
            res.cookie('token', token, { httpOnly: true }).json({ ok: true, id: username, username });
        });
    } catch (error) {
        console.error("Error during registration:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
});


// Login endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // Use username to query the database
    const params = {
        TableName: process.env.TABLE_NAMES_USERS,
        Key: {
            id: { S: username }, // Here id should be the unique identifier, which is the username
        },
    };

    console.log("Retrieving params:", params);

    try {
        const { Item } = await dbClient.send(new GetItemCommand(params));
        console.log("Retrieved item:", Item);

        if (!Item) {
            return res.status(401).json({ message: "User not found" });
        }

        // Verify the password
        const passOk = password === Item.password.S; // Compare the provided password with the stored password
        console.log({ Item, password, passOk });

        if (passOk) {
            // Generate JWT token if the password is correct
            jwt.sign({ username, id: Item.id.S }, secretSalt, {}, (err, token) => {
                if (err) throw err;

                res.cookie('token', token).json({ 'ok' : true });
                console.log("User logged in successfully");
            });
        } else {
            res.status(401).json({ message: "Invalid password" });
        }
    } catch (error) {
        console.error("Error during login:", error);
        res.status(400).json({ error: "Internal Server Error", details: error.message });
    }
});

// Add Expense endpoint (updated to use userId from JWT and timestamp)
// Helper function to convert month number to month name
function getMonthName(monthNumber) {
    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    return monthNames[monthNumber];
}

// Add Expense endpoint (updated to store month as month name)
app.post('/add', authenticateJWT, async (req, res) => {
    let { amount, category } = req.body;

    // Validate if amount is a number
    if (isNaN(amount)) {
        return res.status(400).json({ error: "Amount must be a number" });
    }

    // Validate if category is one of the allowed values
    // if (!allowedCategories.includes(category)) {
    //     return res.status(400).json({ error: `Invalid category. Allowed values are: ${allowedCategories.join(', ')}` });
    // }

    amount = parseFloat(amount); 
    const expenseId = uuidv4();
    const userId = req.user.id; // Get user ID from JWT
    const timestamp = new Date(); // Get current date

    const monthName = getMonthName(timestamp.getMonth()); // Get month name

    const params = {
        TableName: process.env.TABLE_NAMES_EXPENSES,
        Item: {
            id: { S: expenseId },
            amount: { N: amount.toString() },
            category: { S: category }, // Store the category
            userId: { S: userId }, // Store the user ID
            date: { S: timestamp.toISOString() }, // Store date as ISO string
            month: { S: monthName }, // Store month as the name of the month
            year: { N: timestamp.getFullYear().toString() }, // Store year as string
        },
    };

    try {
        await dbClient.send(new PutItemCommand(params));
        console.log({ id: expenseId, amount, category, userId, date: timestamp, month: monthName });
        res.json({ ok: true });
    } catch (error) {
        console.error("Error while adding expense:", error);
        res.status(400).json({ error: "Internal Server Error", details: error.message });
    }
});


// View all expenses
app.get('/view', authenticateJWT, async (req, res) => {
    const params = {
        TableName: process.env.TABLE_NAMES_EXPENSES,
        FilterExpression: "userId = :userId",
        ExpressionAttributeValues: {
            ":userId": { S: req.user.id } // Filter expenses based on the logged-in user
        },
    };

    try {
        const data = await dbClient.send(new ScanCommand(params));
        const expenses = data.Items.map(item => ({
            id: item.id.S,
            amount: item.amount.S,
            category: item.category.S,
            date: item.date.S,
            month: item.month.S
        }));
        res.json({
            ok: true,
            expenses: expenses,
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({ ok: false, details: error.message });
    }
});

// Logout endpoint
app.post('/logout', (req, res) => {
    res.clearCookie('token');  // Clear the JWT token cookie
    res.json({'ok':true});
});

// Start the server and initialize DynamoDB tables
app.listen(process.env.PORT, async () => {
    console.log(`Running on port: ${process.env.PORT}`);
    await setupDynamoTables();
});
