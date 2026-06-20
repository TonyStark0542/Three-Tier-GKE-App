// js/main.js
document.addEventListener('DOMContentLoaded', function() {
    fetch(`${API_BASE_URL}/books`)
        .then(response => response.json())
        .then(data => {
            const booksGrid = document.getElementById('books-grid');
            booksGrid.innerHTML = '';

            data.forEach(book => {
                const bookItem = document.createElement('div');
                bookItem.className = 'book-item';

                const link = document.createElement('a');
                // Link to the detail page with the ID in the URL
                link.href = `book-detail.html?id=${book._id}`;
                link.style.textDecoration = 'none';
                
                const img = document.createElement('img');
                img.src = `data:image/jpeg;base64,${book.cover_image}`;
                img.alt = book.title;

                const title = document.createElement('h4');
                title.textContent = (book.title || 'No Title').toUpperCase();

                const author = document.createElement('p');
                author.textContent = book.author || 'No Author';

                link.appendChild(img);
                link.appendChild(title);
                link.appendChild(author);
                bookItem.appendChild(link);
                booksGrid.appendChild(bookItem);
            });
        })
        .catch(error => console.error('Error fetching books:', error));
});