const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wnmu5yt.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
/* client.connect(err => {
    console.log('connected');
  const collection = client.db("test").collection("devices");
  // perform actions on the collection object
  client.close();
}); */


async function run(){
  try{
    await client.connect();
    console.log('database connected');
    const servicesCollection = client.db('doctors_portal').collection('services');

    app.get('/service', async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query);
      const service = await cursor.toArray();
      res.send(service);
    })
  }

  finally{
    // client.close();
  }
}

run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello form Doctors portal');
});

app.listen(port, () => {
  console.log(`Doctors app listening on port ${port}`)
});