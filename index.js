const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

/* middletare function */
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'UnAuthorized Access' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden Access' })
    }
    /* set decoded in req */
    req.decoded = decoded;
    next();
  });
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wnmu5yt.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
/* client.connect(err => {
    console.log('connected');
  const collection = client.db("test").collection("devices");
  // perform actions on the collection object
  client.close();
}); */


async function run() {
  try {
    await client.connect();
    console.log('database connected');
    const servicesCollection = client.db('doctors_portal').collection('services');
    const bookingCollection = client.db('doctors_portal').collection('bookings');
    const userCollection = client.db('doctors_portal').collection('users')

    app.get('/service', async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query);
      const service = await cursor.toArray();
      res.send(service);
    });

    /* all users */
    app.get('/user', verifyJWT, async (req, res) => {
      const user = await userCollection.find().toArray();
      res.send(user);
    });

    /* requireAuth / require Admin */
    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email;
      /* check the role */
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === 'admin';
      res.send({ admin: isAdmin });
    });

    /* Admin */
    app.put('/user/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      /* admin level role => jokhon user request ashatese tokhon amra user verify kortase then amra database theke user ta k find kortase then user er role jodi admin hoy tahole amra admin filter kortase er jodi user role jodi admin na hoy tahole frobidden status set kortase */
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({ email: requester });
      /* if requester role are matched on admin then we are filter the admin access else we get error 403 status */
      if (requesterAccount.role === 'admin') {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: 'admin' }
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
      else {
        res.status(403).send({ message: 'forbidden' });
      }

    });

    /* insert/ update users */
    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ result, token: token });
    });

    // this is not a proper way to query
    // after learning more about mongodb use agrigate lookup, pipeline, match, group (amra serviceCollection and bookingCollection k agrigate korse ba jora dise)

    app.get('/available', async (req, res) => {
      const date = req.query.date;

      // step-1: get all services 
      const services = await servicesCollection.find().toArray();

      // step-2: get the booking of that day output: [{}, {}, {}, {}, {}]
      const query = { date: date }
      const bookings = await bookingCollection.find(query).toArray();

      // step-3: for each service, find bookings for that service
      services.forEach(service => {
        // setp-4: find booking for that service output: [{}, {}, {}]
        const serviceBookings = bookings.filter(book => book.treatment === service.name);
        // step-5: select slots for that service bookings - map kore amra array of object er kono akta property k niye ashate pari amra shob gula service theke booking er jei slot ase sheita k map kore niye ashatase
        const bookedSlots = serviceBookings.map(book => book.slot);

        // step-6: select those slots that are not in bookedSlots javascript select from one array do not exist in another array (serach it)
        const available = service.slots.filter(slot => !bookedSlots.includes(slot));
        // step-7: set available to slots to make it easier
        service.available = available;
      });

      res.send(services);
    });

    /* 
    * app.get('/booking') // get all bookings in the collection or get more than one or by filter
    * app.get('/booking/:id') // get a specific booking
    * app.post('/booking') // add a new booking
    * app.patch('/booking') // update 
    * app.put('/booking') // upsert => (update/insert) if user are alreday exists then update or user are not exists then create user means insert user
    * app.delete('/booking') // delete
    * jwt.sign({playload => add your user email or user data: '', variable}, secret => secret-token process.env.ACCESS_TOKEN_SECRET, options => { we are add expire duration expiresIn: '1h' })
    */

    app.get('/booking', verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      /*
      we can handle authorization by condition if(authorization) then you can get the data else you cant (amra aita use korte pari abar akta funtion niye function a same kaj ta kore amra ai api majhe function k call korbo aita k amra middletare function bolte pari)
      const authorization = req.headers.authorization;
      console.log(authorization); 
      */
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient }
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings);
      }
      else {
        return res.status(403).send({ message: 'Forbidden Access' });
      }

    });

    app.post('/booking', async (req, res) => {
      const booking = req.body;
      /* same value are save multiple time we are stop to do that */
      const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient };

      const exists = await bookingCollection.findOne(query);
      /* jodi booking database e thake tahole amra 2nd time same treatment book korte parbo na */
      if (exists) {
        return res.send({ success: false, booking: exists })
      }
      const result = await bookingCollection.insertOne(booking);
      res.send({ success: true, result });
    })

  }

  finally {
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