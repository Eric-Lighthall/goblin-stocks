require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { MongoClient, ServerApiVersion  } = require('mongodb');
const moment = require('moment-timezone');
const cron = require('node-cron');
const cors = require('cors');

const BNET_ID = process.env.BNET_ID;
const BNET_SECRET = process.env.BNET_SECRET;
const app = express();

app.use(cors());

let db,
      dbConnectionString = process.env.MONGODB_URI
      dbName = 'WoWTokenData'

MongoClient.connect(dbConnectionString, {useUnifiedTopology: true})
  .then(client => {
    console.log(`Connected to ${dbName} Database`);
    db = client.db(dbName);
});


app.use(express.static('public'))

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Get token prices from mongodb
app.get('/token-prices', async (req, res) => {
  try {
    const clientTimezone = moment.tz.guess();
    const { timeRange } = req.query;

    let query = {};

    if (timeRange) {
      const currentDate = moment();
      let startDate;

      switch (timeRange) {
        case '12h':
        startDate = currentDate.subtract(12, 'hours');
        console.log('12 hours selected');
          break;
        case '24h':
          startDate = currentDate.subtract(24, 'hours');
          console.log('24 hours selected');
          break;
        case '1w':
          startDate = currentDate.subtract(1, 'week');
          console.log('1w selected');
          break;
        case '1m':
          startDate = currentDate.subtract(1, 'month');
          break;
        case '1y':
          startDate = currentDate.subtract(1, 'year');
          break;
        case '5y':
          startDate = currentDate.subtract(5, 'years');
          break;
        default:
          startDate = null;
      }

      if (startDate) {
        query.timestamp = { $gte: startDate.format('YYYY-MM-DD HH:mm') };
      }
    }

    const collection = await db.collection('tokenPrices').find(query).sort({timestamp: - 1}).toArray();
    
    const localPrices = collection.map(price => {
    const utcDate = moment.utc(price.timestamp, 'YYYY-MM-DD HH:mm');
    const localDate = utcDate.tz(clientTimezone);
    const formattedTimestamp = localDate.toISOString();
      return {
        ...price,
        timestamp: formattedTimestamp,
      };
    });

    res.json(localPrices);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('An error occurred while retrieving token prices from the database.');
  }
});

// Get token price from wow API
cron.schedule('*/30 * * * *', async (req, res) => {
    try {
      const tokenResponse = await axios.post('https://oauth.battle.net/token', null, {
        params: {
          grant_type: 'client_credentials',
        },
        auth: {
          username: BNET_ID,
          password: BNET_SECRET,
        },
      });
  
      const accessToken = tokenResponse.data.access_token;
  
      const apiResponse = await axios.get('https://us.api.blizzard.com/data/wow/token/index?namespace=dynamic-us', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
  
      const tokenPrice = Number(apiResponse.data.price) / 10000;

    const currentDate = new Date();
    const formattedTimestamp = currentDate.toISOString().slice(0, 16).replace('T', ' ');

      const collection = db.collection('tokenPrices');
      await collection.insertOne({
        timestamp: formattedTimestamp,
        price: tokenPrice,
      });

      console.log(`Token price updated at ${formattedTimestamp}: ${tokenPrice}`);
      res.json({ price: tokenPrice})
    } catch (error) {
      console.error('Error:', error.message);
      res.status(500).send('An error occurred while fetching the WoW token price.');
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
})