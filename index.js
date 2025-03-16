const express = require('express');
require('dotenv').config();
const cors = require('cors');
const app = express();
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Middleware
const corsOptions = {
  origin: 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

// Create JWT Token
app.post('/jwt', async (req, res) => {
  const { email } = req.body; // Directly extracting email from the body
  if (!email) {
    return res.status(400).send({ message: 'Email is required' });
  }

  try {
    const token = jwt.sign({ email }, process.env.DB_ACCESS_TOKEN, {
      expiresIn: '365d',
    });

    res
      .cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      })
      .send({ success: true });
  } catch (error) {
    console.error('Error generating JWT token:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

// JWT Token Verification Middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }

  jwt.verify(token, process.env.DB_ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      console.log('JWT verification error:', err);
      return res.status(401).send({ message: 'Unauthorized access' });
    }
    req.user = decoded;
    next();
  });
};

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.rxtju.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Creating MongoClient
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // MongoDB Database and Collection
    const userCollection = client.db("vituGlow").collection('users');
    const productCollection = client.db("vituGlow").collection('products');
    const orderCollection = client.db("vituGlow").collection('orders');

    

    // Save or Update User
    app.post('/users/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = req.body;
      const isExist = await userCollection.findOne(query);
      if (isExist) {
        return res.send(isExist);
      }
      const result = await userCollection.insertOne({ ...user, role: 'customer', timestamp: Date.now() });
      res.send(result);
    });


    // manage user status role
    app.patch('/users/:email', verifyToken, async(req,res) => {
      const email = req.params.email;
      const query = {email}
      const user = await userCollection.findOne(query)
      if(!user || user?.status === 'requested') return res.status(400).send('You have already requested, wait for the some time')
      
    const updateDoc = {
      $set: {
        status: "Requested"
      }
    }
    const result = await userCollection.updateOne(updateDoc)
    console.log(result)
    })


    // get product
    app.get("/products", async(req,res) => {
         const result = await productCollection.find().toArray()
         res.send(result)
    })
   
    // get product  by id 
    app.get("/product/:id", async(req,res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await productCollection.findOne(query)
      res.send(result)
    })

   

    // manage product quantity
    app.patch('/products/quantity/:id', verifyToken,async(req,res) => {
      const id = req.params.id;
      const {quantityToUpdate,status} = req.body;
      const filter = {_id: new ObjectId(id)}
      let updateDoc = {
        $inc: {quantity: -quantityToUpdate},
      }
       if(status === 'increase'){
        updateDoc = {
          $inc: {quantity: quantityToUpdate},
        }
       }
      const result = await productCollection.updateOne(filter,updateDoc)
      res.send(result)
    })

    // Save Product
    app.post("/products", async (req, res) => {
      const product = req.body;
      const result = await productCollection.insertOne(product);
      res.send(result);
    });


     // save order 
     app.post('/order',verifyToken, async(req,res) => {
      const orderInfo = req.body;
      const result = await orderCollection.insertOne(orderInfo)  
      res.send(result);
 })

//  get all customer orders for spacific email //amd use aggregate  for get more data from productCollection
     app.get('/customer-order/:email', verifyToken, async(req,res) => {
      const email = req.params.email
      const query = {"customer.email" : email}
      const result = await orderCollection.aggregate([
        {
          $match: query,  //match specific customer by email 

        },
        {
          $addFields: {
            productId: {$toObjectId : '$productId'},  //covert productId  string field to objectId field 
          },
        },
        {
          $lookup:{
            // go to a diffrent collection and look for data
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            as: 'products'
          },
        },
        {$unwind: '$products'}, //unwind look data ,widthout return array
        {
          $addFields: {
            name: '$products.productName',
            image: '$products.image',
            category: '$products.category',
          },
        },
        {
          // remove product object property from order
          $project: {
            products: 0,
          }
        }
      ]).toArray()
      res.send(result)
     })

    //  delete an order 
    app.delete('/order/:id', verifyToken, async(req,res) => {
        const id = req.params.id
        const query = {_id: new ObjectId(id)}
        const order = await orderCollection.findOne(query)
        if(order.status === 'delivered') return res.status(409).send({ message:'cannot cancel once the product is delivered'})
        const result = await orderCollection.deleteOne(query)
        res.send(result)
    })

    console.log("Successfully connected to MongoDB deployment!");
  } finally {
    // MongoClient will be closed
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
