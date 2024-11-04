const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { restart } = require('nodemon');
const { error } = require('console');
const rateLimit = require('express-rate-limit');
const {body, query, param, validationResult } = require('express-validator');

const app = express();
app.use(cors());
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
                
                const normalizedData = {};
                for (let key in data) {
                    const cleanKey = key.replace(/'/g, '').trim(); 
                    normalizedData[cleanKey] = data[key];
                }
                normalizedData.id = rowNumber.toString();
                results.push(normalizedData);
                rowNumber++;
            })
            .on('end', () => {
                //console.log("Sample normalized data row 1:", results[0]); // Verify normalization
                resolve(results);
            })
            .on('error', (error) => {
                console.error("Error loading CSV data:", error);
                reject(error);
            });
    });
}


const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use(apiLimiter);


app.get('/api/destination/:id', 
    param('id').isInt({ min: 1 }).withMessage('Destination ID must be a positive integer'), 
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() }); 
        }

        const { id } = req.params;

        loadCSVData().then(data => {
            const destination = data.find(item => item.id === id);
            if (!destination) {
                return res.status(404).json({ error: `Destination with ID ${id} not found` });
            }
            res.json(destination);
        }).catch(error => {
            console.error("Error loading CSV data:", error);
            res.status(500).json({ error: 'Failed to load data' });
        });
    });

app.get('/api/destination/:id/coordinates', 
    param('id').isInt({min: 1}).withMessage('Destination ID must be a positive integer'),
    async (req, res) => {

        const errors = validationResult(req);
        if(!errors.isEmpty()){
            return res.status(400).json({errors: errors.array()});
        }

        const {id} = req.params;

        loadCSVData().then(data =>{
            const destination = data.find(item => item.id === id);
            if(!destination) {
                return res.status(404).json({errors: `Destination with id ${id} not found`});
            }

            res.json({
                latitude: destination.Latitude,
                longitude: destination.Longitude
            });
        }).catch(error=>{
            console.error("Error loading CSV data", error);
            res.status(500).json({error: 'Failed to load data'});
        });
    
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

app.get('/api/search', 
    [
        query('field').isIn(['Destination', 'Region', 'Country', 'Currency', 'Language', 'Category', 'Majority Religion', 'Safety', 'Cost of Living']).withMessage('Invalid field'),
        query('pattern').isString().trim().escape().withMessage('Pattern must be a valid string'),
        query('n').optional().isInt({ min: 1, max: 50 }).withMessage('n must be a positive integer between 1 and 50')
    ],  
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { field, pattern } = req.query;
        const n = req.query.n ? parseInt(req.query.n) : null;

        try {
            const data = await loadCSVData();
            //console.log("Data loaded for search:", data.length);

            const matches = data
                .filter(item => item[field] && item[field].toString().trim().toLowerCase().includes(pattern.toLowerCase()))
                .slice(0, n || data.length);

            //console.log("Matches found:", matches.length);
            res.json({ results: matches });
        } catch (error) {
            console.error("Error loading CSV data:", error);
            res.status(500).json({ error: 'Failed to load data' });
        }
    }
);

const Datastore = require('nedb');

const listsDb = new Datastore({ filename: path.join(__dirname, 'data', 'lists.db'), autoload: true });

app.post('/api/lists', 
    [
        body('name').isString().trim().isLength({min: 1, max: 25}).escape()
            .withMessage('List name mus be a non-empty string up to 25 characters')
    ],
    (req, res) => {
        const errors = validationResult(req);

        if(!errors.isEmpty()){
            return res.status(400).json({errors: errors.array()});
        }

    const {name} = req.body;

    listsDb.findOne({ name }, (err, existingList) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (existingList) {
            return res.status(409).json({ error: `List with name '${name}' already exists` });
        }

        
        const newList = { name, destinations: [] };
        listsDb.insert(newList, (err, insertedList) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to create list' });
            }

            res.status(201).json({ message: `List '${name}' created successfully`, list: insertedList });
        });
    });

 
});

app.put('/api/lists/:name/destinations', 
    [
        param('name').isString().trim().isLength({min: 1, max: 25}).escape()
            .withMessage('List name must be a valid non-empty string up to 25 characters'),
        body('destinationIDs').isArray({min: 1}).withMessage('Destination IDs must be non-empty array'),
        body('destinationIDs.*').isString().trim().escape().withMessage('Each destination ID must be a string')

    ],
    
    async (req, res) => {

        const errors = validationResult(req);
        if(!errors.isEmpty()){
            return res.status(400).json({errors: errors.array() });
        }

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

app.get('/api/lists/:name/destination-ids', 
    [
        param('name').isString().trim().isLength({min: 1, max: 25}).escape()
            .withMessage('List name must be valid non-empty string up to 25 characters')
    ],
    
    (req, res) => {

        const errors = validationResult(req);
        if(!errors.isEmpty()){
            return res.status(400).json({errors: errors.array()});
        }

    const {name} = req.params;

    listsDb.findOne({ name }, (err, list) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (!list) {
            return res.status(404).json({ error: `List with name '${name}' does not exist` });
        }

        res.json({ destinationIDs: list.destinations });
    });
    
});

app.delete('/api/lists/:name/delete', 
    [
        param('name').isString().trim().isLength({min: 1, max: 25}).escape()
            .withMessage('List name must be a valid non-empty string up to 25 characters')

    ],
    
    (req, res) => {
        const errors = validationResult(req);
        if(!errors.isEmpty()){
            return res.status(400).json({errors: errors.array()});
        }

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

app.get('/api/lists/:name/destination-details', 
    [
        param('name').isString().trim().isLength({min:1, max:25}).escape()
            .withMessage('List name must be a valid non-empty string up to 50 characters')


    ],
    
    async(req, res) =>{
        const errors = validationResult(req);
        if(!errors.isEmpty()){
            return res.status(400).json({errors: errors.array() })
        }

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
                        language: destination.Language

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
