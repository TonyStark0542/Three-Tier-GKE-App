// js/book-detail.js
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const bookId = urlParams.get('id');

    if (bookId) {
        fetch(`${API_BASE_URL}/books/${bookId}`)
            .then(response => response.json())
            .then(book => {
                document.getElementById('detail-image').src = `data:image/jpeg;base64,${book.cover_image}`;
                document.getElementById('detail-title').textContent = book.title;
                document.getElementById('detail-author').textContent = book.author;
                document.getElementById('detail-publisher').textContent = book.publisher;
                document.getElementById('detail-price').textContent = book.price;
                document.getElementById('detail-category').textContent = book.category;
                document.getElementById('detail-stock').textContent = book.stock;
            })
            .catch(err => console.error("Error loading book details", err));
    }
});
