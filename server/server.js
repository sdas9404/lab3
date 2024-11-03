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

const Datastore = require('nedb');

const listsDb = new Datastore({ filename: path.join(__dirname, 'data', 'lists.db'), autoload: true });

app.post('/api/lists', (req, res) => {
    const {name} = req.body;

    if(!name){
        return res.status(400).json({error: 'List name is required'});
    
    }

    listsDb.findOne({name}, (err, existingList) => {
        if(err){
            return res.status(500).json({error: 'Database error'});
        }
        if(existingList){
            return res.status(400).json({error: 'List with this name already exists'});
        }

        const newList = {name, destinations: []};
        listsDb.insert(newList, (err, doc) => {
            if(err){
                return res.status(500).json({error: 'failed to create list'});
            }
            res.status(201).json({message: `List '${name}' created successfully,`, list:doc});
        });
    });
});

app.put('/api/lists/:name/destinations', async (req, res) => {
    const { name } = req.params;
    const { destinationIDs } = req.body;

    if (!destinationIDs || !Array.isArray(destinationIDs)) {
        return res.status(400).json({ error: 'Destination IDs are required and must be an array' });
    }

    try {
        const data = await loadCSVData();
        const validIDs = new Set(data.map((item) => item.id));

        const invalidIDs = destinationIDs.filter(id => !validIDs.has(id));
        const validDestinationIDs = destinationIDs.filter(id => validIDs.has(id));

        if (invalidIDs.length > 0) {
            return res.status(400).json({
                error: `Invalid destination IDs: ${invalidIDs.join(", ")}`,
                message: "Please provide valid destination IDs only"
            });
        }

        
        listsDb.findOne({ name }, (err, list) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (!list) {
                return res.status(404).json({ error: `List with name '${name}' does not exist` });
            }

            
            listsDb.update(
                { _id: list._id },
                { $set: { destinations: validDestinationIDs } },
                { multi: false, upsert: false },
                (err, numReplaced) => {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to update destinations' });
                    }
                    
                   
                    listsDb.persistence.compactDatafile();
                    listsDb.loadDatabase();

                    res.json({ message: `Destinations updated for list '${name}'`, destinations: validDestinationIDs });
                }
            );
        });
    } catch (error) {
        console.error("Error loading CSV data:", error);
        res.status(500).json({ error: 'Failed to load data' });
    }
});

app.get('/api/lists/:name/destination-ids', (req, res) => {

    const {name} = req.params;

    listsDb.findOne({name}, (err, list) =>{

        if(err){
            return res.status(500).json({error: 'Database error'});
        }

        if(!list){
            return res.status(404).json({error: `List with name '${name}' does not exist`});
        }

        res.json({destinationIDs: list.destinations});
    });
});

app.delete('/api/lists/:name/delete', (req, res) => {

    const{name} = req.params;

    listsDb.remove({name}, {}, (err, numRemoved) => {
        if(err){
            return res.status(500).json({error: 'Database error'});
        }

        if(numRemoved === 0){
            return res.status(404).json({error: `List with name '${name}' does not exist`});

        }

        listsDb.persistence.compactDatafile();

        res.json({message: `List '${name}' successfully deleted`});
    });

});

app.get('/api/lists/:name/destination-details', async(req, res) =>{

    const {name} = req.params;


    listsDb.findOne({name}, async (err, list) =>{
        if(err) {
            return res.status(500).json({error: 'Database error'});
        }
        if(!list){
            return res.status(404).json({error: `List with name '${name}' does not exist`});

        }

        try{
            const data = await loadCSVData();

            const destinationDetails = list.destinations.map(destinationID => {
                const destination = data.find(item => item.id === destinationID);
                if(destination){
                    return{
                        name: destination.Destination,
                        region: destination.Region,
                        country: destination.Country,
                        coordinates: {
                            latitude: destination.Latitude,
                            longitude: destination.Longitude
                        },
                        currency: destination.Currency,
                        language: destination.Langugae

                    };
                   
                }
                return null;
            }).filter(detail => detail !== null);

            res.json({destinationDetails});
        }catch (error) {
            console.error("Error Loading data: ", error);
            res.status(500).json({error: 'Failed to load data'})
        }
    });
});



app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
