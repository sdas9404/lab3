
const map = L.map('map').setView([20, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

let markers = [];


async function performSearch() {
    const field = document.getElementById('field').value;
    const pattern = document.getElementById('pattern').value;
    const numResults = document.getElementById('numResults').value || ''; 
    const nParam = numResults ? `&n=${numResults}` : ''; 

    try {
        
        const response = await fetch(`http://localhost:3000/api/search?field=${encodeURIComponent(field)}&pattern=${encodeURIComponent(pattern)}${nParam}`);
        const data = await response.json();

        if (response.ok) {
            clearMarkers();
            clearTable();

            
            displayResultsOnMap(data.results);
            displayResultsInTable(data.results);
        } else {
            const errorMessage = data.errors
                ? data.errors.map(error => error.msg).join('\n')
                : data.error || 'An unknown error occurred';
            alert(`Error: ${errorMessage}`);
        }
    } catch (error) {
        console.error('Error performing search:', error);
        alert('Error: Failed to perform search due to a network or server issue');
    }
}


function clearMarkers() {
    markers.forEach(marker => marker.remove());
    markers = [];
}


function clearTable() {
    const tableBody = document.getElementById('results-table').querySelector('tbody');
    tableBody.innerHTML = '';
}


function displayResultsOnMap(results) {
    console.log("Search results:", results);
    results.forEach(result => {
        const { Latitude, Longitude, Destination } = result;
        const destinationName = Destination ? Destination.trim() : 'Unknown Location'; 
        if (Latitude && Longitude) {
            const marker = L.marker([parseFloat(Latitude), parseFloat(Longitude)])
                .addTo(map)
                .bindPopup(`<strong>${destinationName || 'Unknown Location'}</strong>`) 
                .on('click', () => {
                    map.setView([parseFloat(Latitude), parseFloat(Longitude)], 10); 
                });
            markers.push(marker);
        }
    });
}


function displayResultsInTable(results) {
    const tableBody = document.getElementById('results-table').querySelector('tbody');
    results.forEach(result => {
        const row = document.createElement('tr');
        Object.values(result).forEach(value => {
            const cell = document.createElement('td');
            cell.textContent = value; 
            row.appendChild(cell);
        });
        tableBody.appendChild(row);
    });
}


document.getElementById('search-btn').addEventListener('click', performSearch);


// Pagination for Table


let currentPage = 1;
let resultsPerPage = 5; 


document.getElementById('resultsPerPage').addEventListener('change', (e) => {
    resultsPerPage = parseInt(e.target.value);
    currentPage = 1; 
    displayCurrentPage(); 
    updatePaginationControls();
});

document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        displayCurrentPage();
        updatePaginationControls();
    }
});

document.getElementById('nextPage').addEventListener('click', () => {
    if (currentPage < Math.ceil(paginatedResults.length / resultsPerPage)) {
        currentPage++;
        displayCurrentPage();
        updatePaginationControls();
    }
});


function updatePaginationControls() {
    const totalPages = Math.ceil(paginatedResults.length / resultsPerPage);
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages;
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
}


function displayCurrentPage() {
    const tableBody = document.getElementById('results-table').querySelector('tbody');
    tableBody.innerHTML = ''; 

    
    const start = (currentPage - 1) * resultsPerPage;
    const end = start + resultsPerPage;
    const currentResults = paginatedResults.slice(start, end);

    
    currentResults.forEach(result => {
        const row = document.createElement('tr');
        Object.values(result).forEach(value => {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.appendChild(cell);
        });
        tableBody.appendChild(row);
    });
}


function displayResultsInTable(results) {
    paginatedResults = results; 
    displayCurrentPage(); 
    updatePaginationControls(); 
}


//Favourite list management 

function showAlert(message) {
    alert(message);
}

async function createFavoriteList() {
    const newListName = document.getElementById('newListName').value.trim();

    if (!newListName || newListName.length > 25) {
        showAlert("List name cannot be empty and must be 25 characters or less.");
        return;
    }

    try {
        const response = await fetch(`/api/lists`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newListName })
        });

        if (response.ok) {
            showAlert(`List "${newListName}" created successfully.`);
        } else {
            const error = await response.json();
            showAlert(`Error: ${error.error}`);
        }
    } catch (error) {
        console.error("Error creating list:", error);
        showAlert("Failed to create list.");
    }
}

async function addDestinationsToList() {
    const listName = document.getElementById('addListName').value.trim();
    const destinationInput = document.getElementById('destinationNames').value.trim();

    if (!listName || listName.length > 25) {
        showAlert("List name cannot be empty and must be 25 characters or less.");
        return;
    }

    const destinations = destinationInput.split(',').map(dest => dest.trim()).filter(dest => dest);

    if (destinations.length === 0) {
        showAlert("Please enter at least one valid destination name.");
        return;
    }

    try {
        const response = await fetch(`/api/lists/${encodeURIComponent(listName)}/destinations`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destinations })
        });

        if (response.ok) {
            showAlert(`Destination(s) "${destinations.join(', ')}" added to list "${listName}".`);
        } else {
            const error = await response.json();
            showAlert(`Error: ${error.error}`);
        }
    } catch (error) {
        console.error("Error adding destinations to list:", error);
        showAlert("Failed to add destinations to list.");
    }
}

async function displayFavoriteList() {
    const listName = document.getElementById('displayListName').value.trim();

    if (!listName || listName.length > 25) {
        showAlert("List name cannot be empty and must be 25 characters or less.");
        return;
    }

    try {
        const response = await fetch(`/api/lists/${encodeURIComponent(listName)}/destination-details`);

        if (response.ok) {
            const data = await response.json();
            populateListTable(data.destinationDetails);
        } else {
            const error = await response.json();
            showAlert(`Error: ${error.error}`);
        }
    } catch (error) {
        console.error("Error retrieving list:", error);
        showAlert("Failed to retrieve list.");
    }
}

function populateListTable(destinations) {
    const tableBody = document.getElementById('favoriteListTable').querySelector('tbody');
    tableBody.innerHTML = ''; // Clear existing rows

    destinations.forEach(destination => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${destination.Destination || ''}</td>
            <td>${destination.Region || ''}</td>
            <td>${destination.Country || ''}</td>
            <td>${destination.Category || ''}</td>
            <td>${destination.Latitude || ''}</td>
            <td>${destination.Longitude || ''}</td>
            <td>${destination["Approximate Annual Tourists"] || ''}</td>
            <td>${destination.Currency || ''}</td>
            <td>${destination["Majority Religion"] || ''}</td>
            <td>${destination["Famous Foods"] || ''}</td>
            <td>${destination.Language || ''}</td>
            <td>${destination["Best Time to Visit"] || ''}</td>
            <td>${destination["Cost of Living"] || ''}</td>
            <td>${destination.Safety || ''}</td>
            <td>${destination["Cultural Significance"] || ''}</td>
            <td>${destination.Description || ''}</td>
        `;
        tableBody.appendChild(row);
    });
}











