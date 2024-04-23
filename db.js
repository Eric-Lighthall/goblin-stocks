// db.js - A module for connecting to MongoDB

require("dotenv").config();
const { MongoClient } = require("mongodb");


let dbConnection;

module.exports = {
    connectToServer: async function (callback) {
      try {
        console.log("Connecting to MongoDB...");
        console.log(process.env.MONGODB_URI);
  
        const client = await MongoClient.connect(process.env.MONGODB_URI, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
        });
  
        dbConnection = client.db('WoWTokenData');
        console.log('Successfully connected to MongoDB.');
        return callback();
      } catch (err) {
        console.error("Connection error: ", err);
        return callback(err);
      }
    },
  
    getDb: function () {
      return dbConnection;
    }
  };
