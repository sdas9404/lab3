const express = require('express');
const bodyParser = require('body-parser');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { restart } = require('nodemon');
const { error } = require('console');

const app = express();
const PORT = 3000;


app.use(bodyParser.json());


function loadCSVData() {
  const results = [];
  const csvFilePath = path.join(__dirname, 'data', 'europe-destinations.csv');

  return new Promise((resolve, reject) => {
    let rowNumber = 1;
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => {
        data.id = rowNumber.toString(); 
        results.push(data);
        rowNumber++;
      })
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}


app.get('/api/destination/:id', async (req, res) => {
  try {
    const data = await loadCSVData();
    const destinationID = req.params.id;

    const destination = data.find((item) => item.id === destinationID);
    if (!destination) {
      return res.status(404).json({ error: 'Destination not found' });
    }

    res.json(destination);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load data' });
  }
});

app.get('/api/destination/:id/coordinates', async (req, res) => {
    try{
        const data = await loadCSVData();
        const destinationID = req.params.id;

        const destination = data.find((item) => item.id === destinationID);
        if(!destination) {
            return res.status(404).json({error: 'Destination not found'});
        }

        //console.log("Destination found:", destination);

        const coordinates = {
            latitude: destination.Latitude,
            longitude: destination.Longitude,
        };

        res.json(coordinates);
    }catch (error){
        res.status(500).json({error: 'Failed to load data'});
    }
});

app.get('/api/countries', async (req, res) => {
    try{
        const data = await loadCSVData();

        const countries = [...new Set(data.map((item) => item.Country))];

        res.json(countries);
    } catch (error) {
        res.status(500).json({error: 'Failed to load data'});
    }
});

app.get('/api/search', async(req, res) => {
    
    const {field, pattern, n } = req.query;


    if(!field || !pattern){

        return res.status(400).json({error: 'Field and pattern are required'});
    }

    try{
        const data = await loadCSVData();

        console.log("Available fields:", Object.keys(data[0]));

        const normalizedField = Object.keys(data[0]).find(
            (key) => key.trim().toLowerCase() === field.trim().toLowerCase()
        );

        if(!normalizedField) {
            return res.status(400).json({error: `Field '${field}' does not exist in data`});
        }

        const matches = data.filter((item) => 
            item[normalizedField] && item[normalizedField].toLowerCase().includes(pattern.toLocaleLowerCase())
        );


        const limitedResults = n ? matches.slice(0, Number(n)) : matches;
        res.json(limitedResults);
    }catch (error){
        res.status(500).json({error: 'Failed to load data'});
    }

});
    


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
