require("dotenv").config();
const express = require("express");
const axios = require("axios");
// const { MongoClient, ServerApiVersion } = require("mongodb");
const moment = require("moment-timezone");
const cron = require("node-cron");
const cors = require("cors");
const db = require("./db.js");

const BNET_ID = process.env.BNET_ID;
const BNET_SECRET = process.env.BNET_SECRET;
const app = express();

app.use(cors());

// let db,
//     dbConnectionString = process.env.MONGODB_URI;
// dbName = "WoWTokenData";

// MongoClient.connect(dbConnectionString, { useUnifiedTopology: true }).then(
//     (client) => {
//         console.log(`Connected to ${dbName} Database`);
//         db = client.db(dbName);
//     }
// );

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
db.connectToServer(function (err) {
    if (err) {
        console.error("Error connecting to MongoDB", err);
        process.exit(1);
    }

    console.log("Connected to DB, setting up server...");
    startServer();
});

function startServer() {
    app.listen(PORT, () => {
        console.log(`Listening on port ${PORT}`);
    });
    
    app.get("/", (req, res) => {
        res.sendFile(__dirname + "/index.html");
    });
}

// Get token prices from mongodb
app.get("/graph-data", async (req, res) => {
    try {
        const clientTimezone = moment.tz.guess();
        const { timeRange = "24h", includeTrends = false } = req.query;

        let query = {};
        const currentDate = moment();

        if (timeRange) {
            let startDate;
            switch (timeRange) {
                case "12h":
                    startDate = currentDate.subtract(12, "hours");
                    console.log("past 12 hours selected");
                    break;
                case "24h":
                    startDate = currentDate.subtract(24, "hours");
                    console.log("past 24 hours selected");
                    break;
                case "1w":
                    startDate = currentDate.subtract(1, "week");
                    console.log("1w selected");
                    break;
                case "1m":
                    startDate = currentDate.subtract(1, "month");
                    break;
                case "1y":
                    startDate = currentDate.subtract(1, "year");
                    break;
                case "5y":
                    startDate = currentDate.subtract(5, "years");
                    break;
                default:
                    startDate = null;
            }

            if (startDate) {
                query.timestamp = {
                    $gte: startDate.format("YYYY-MM-DD HH:mm"),
                };
            }
        }

        const dbConnection = db.getDb();
        const prices = await dbConnection
            .collection("tokenPrices")
            .find(query)
            .sort({ timestamp: -1 })
            .toArray();

        const formattedPrices = prices.map((price) => {
            const utcDate = moment.utc(price.timestamp, "YYYY-MM-DD HH:mm");
            const localDate = utcDate.tz(clientTimezone);
            return {
                ...price,
                timestamp: localDate.toISOString(),
            };
        });

        res.json(formattedPrices);
    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).send(
            "An error occurred while retrieving token prices from the database."
        );
    }
});

app.get("/trend-data", async (req, res) => {
    const clientTimezone = moment.tz.guess();
    const maxPeriod = moment().subtract(1, "months"); // Always fetch data for the past month

    const query = {
        timestamp: { $gte: maxPeriod.format("YYYY-MM-DD HH:mm") },
    };

    const dbConnection = db.getDb();
    const prices = await dbConnection
        .collection("tokenPrices")
        .find(query)
        .sort({ timestamp: -1 })
        .toArray();

    const trendData = calculateTrends(prices);
    res.json({ trends: trendData });
});

// Calculate trends for given time ranges
function calculateTrends(prices) {
    const currentDate = moment.utc();
    let trends = {};

    const periods = {
        "30m": { number: 30, period: "minutes" },
        "1d": { number: 1, period: "days" },
        "1w": { number: 7, period: "days" },
        "1m": { number: 1, period: "months" },
    };

    for (let key in periods) {
        const { number, period } = periods[key];
        const pastDate = moment.utc().startOf(period).subtract(number, period);

        console.log(`Calculating trend for ${key} period`);
        console.log("Current date:", currentDate.format());
        console.log("Past date:", pastDate.format());

        const relevantPrices = prices.filter((price) => {
            const priceDate = moment.utc(price.timestamp);
            return priceDate.isSameOrAfter(pastDate);
        });

        if (relevantPrices.length) {
            const startPrice = relevantPrices[relevantPrices.length - 1].price;
            const currentPrice  = relevantPrices[0].price;
            const percentChange = ((currentPrice - startPrice) / startPrice) * 100;
            trends[key] = {
                start: startPrice,
                current: currentPrice,
                percentChange: percentChange.toFixed(2) + "%",
            };
            console.log("Start price:", startPrice);
            console.log("Current price:", currentPrice);
            console.log("Percent change:", percentChange);
        } else {
            trends[key] = {
                high: null,
                low: null,
                percentChange: "No data",
            };
        }
    }

    return trends;
}

// Get token price from wow API
if (process.env.NODE_ENV === "production") {
    cron.schedule("*/30 * * * *", async (req, res) => {
        try {
            const tokenResponse = await axios.post(
                "https://oauth.battle.net/token",
                null,
                {
                    params: {
                        grant_type: "client_credentials",
                    },
                    auth: {
                        username: BNET_ID,
                        password: BNET_SECRET,
                    },
                }
            );

            const accessToken = tokenResponse.data.access_token;

            const apiResponse = await axios.get(
                "https://us.api.blizzard.com/data/wow/token/index?namespace=dynamic-us",
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );

            const tokenPrice = Number(apiResponse.data.price) / 10000;

            const currentDate = new Date();
            const formattedTimestamp = currentDate
                .toISOString()
                .slice(0, 16)
                .replace("T", " ");

            const dbConnection = db.getDb();
            const collection = dbConnection.collection("tokenPrices");
            await collection.insertOne({
                timestamp: formattedTimestamp,
                price: tokenPrice,
            });

            console.log(
                `Token price updated at ${formattedTimestamp}: ${tokenPrice}`
            );
            // res.json({ price: tokenPrice})
        } catch (error) {
            console.error("Error:", error.message);
            // res.status(500).send('An error occurred while fetching the WoW token price.');
        }
    });
}
