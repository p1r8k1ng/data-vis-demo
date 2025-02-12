fetch('https://linked.art/ns/v1/linked-art.json')
    .then(response => response.json())
    .then(data => {
        console.log("API Response:", data); // Debugging step
    })
    .catch(error => console.error("Error fetching data:", error));