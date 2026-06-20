~// js/category.js
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const categoryName = urlParams.get('name');
    
    if (categoryName) {
        document.getElementById('cat-name').textContent = categoryName;
        
        fetch(`${API_BASE_URL}/books/category/${encodeURIComponent(categoryName)}`)
            .then(response => response.json())
            .then(data => {
                const booksGrid = document.getElementById('books-grid');
                booksGrid.innerHTML = '';
                data.forEach(book => {
                    const bookItem = document.createElement('div');
                    bookItem.className = 'book-item';
                    const link = document.createElement('a');
                    link.href = `book-detail.html?id=${book._id}`;
                    
                    const img = document.createElement('img');
                    img.src = `data:image/jpeg;base64,${book.cover_image}`;
                    
                    const title = document.createElement('h4');
                    title.textContent = book.title.toUpperCase();

                    link.appendChild(img);
                    link.appendChild(title);
                    bookItem.appendChild(link);
                    booksGrid.appendChild(bookItem);
                });
            });
    }
});
