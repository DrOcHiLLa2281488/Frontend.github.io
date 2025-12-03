// ============================================
// КОНФИГУРАЦИЯ
// ============================================
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbxim0LsckzbHtjWQToFE7k8qOUadmhX1DtbIN2KoUk9d8MD3T8puvYv0YFnTvKWOTjRMw/exec', // Вставьте сюда URL из шага 1.5
    MANAGER_USERNAME: '@parfumdepo'
};

// ============================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================
let TelegramWebApp;
let products = []; // Все товары
let filteredProducts = []; // Отфильтрованные товары
let cart = []; // Корзина текущего пользователя
let currentUser = null; // Данные пользователя Telegram
let sortDirection = 'asc'; // Направление сортировки
let currentModalProduct = null; // Товар в модальном окне
let currentQuantity = 1; // Количество в модальном окне

// ============================================
// 1. ИНИЦИАЛИЗАЦИЯ TELEGRAM MINI APP
// ============================================
function initTelegramApp() {
    TelegramWebApp = window.Telegram.WebApp;
    
    // Расширяем на весь экран
    TelegramWebApp.expand();
    
    // Получаем данные пользователя
    currentUser = TelegramWebApp.initDataUnsafe.user;
    
    console.log('Пользователь:', currentUser);
    
    // Загружаем данные
    loadProducts();
    loadCart();
    
    // Настраиваем кнопки
    setupEventListeners();
    
    // Показываем главную страницу
    showShopPage();
}

// ============================================
// 2. РАБОТА С API (Google Sheets)
// ============================================

// Загрузить все товары
async function loadProducts() {
    try {
        showLoading(true);
        
        const response = await fetch(`${CONFIG.API_URL}?sheet=Products`);
        const data = await response.json();
        
        if (data.success) {
            products = data.data;
            filteredProducts = [...products];
            renderProducts();
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        showError('Не удалось загрузить каталог');
    } finally {
        showLoading(false);
    }
}

// Загрузить корзину пользователя
async function loadCart() {
    if (!currentUser?.id) return;
    
    try {
        const response = await fetch(
            `${CONFIG.API_URL}?sheet=Carts&user_id=${currentUser.id}`
        );
        const data = await response.json();
        
        if (data.success) {
            cart = data.data;
            updateCartUI();
        }
    } catch (error) {
        console.error('Ошибка загрузки корзины:', error);
        // Создаем пустую корзину
        cart = [];
    }
}

// Сохранить корзину на сервер
async function saveCart() {
    if (!currentUser?.id) return;
    
    try {
        await fetch(CONFIG.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'UPDATE_CART',
                user_id: currentUser.id,
                cart: cart
            })
        });
    } catch (error) {
        console.error('Ошибка сохранения корзины:', error);
    }
}

// ============================================
// 3. РЕНДЕРИНГ ИНТЕРФЕЙСА
// ============================================

// Показать товары в каталоге
function renderProducts() {
    const container = document.getElementById('catalog');
    
    if (filteredProducts.length === 0) {
        container.innerHTML = `
            <div class="empty-cart">
                😕 Товары не найдены<br>
                <small>Попробуйте другой запрос</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredProducts.map(product => `
        <div class="product-card" data-id="${product.id}">
            <img src="${product.image_url || 'https://via.placeholder.com/300x200?text=No+Image'}" 
                 alt="${product.name}" 
                 class="product-image">
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                <div class="product-details">
                    ${product.concentration} • ${product.volume}
                </div>
                <div class="product-price">
                    ${formatPrice(product.price)} ₽
                </div>
            </div>
        </div>
    `).join('');
    
    // Добавляем обработчики клика на товары
    document.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', () => {
            const productId = parseInt(card.dataset.id);
            const product = products.find(p => p.id === productId);
            if (product) openProductModal(product);
        });
    });
}

// Открыть модальное окно товара
function openProductModal(product) {
    currentModalProduct = product;
    currentQuantity = 1;
    
    document.getElementById('modalImage').src = 
        product.image_url || 'https://via.placeholder.com/300x200?text=No+Image';
    document.getElementById('modalName').textContent = product.name;
    document.getElementById('modalConcentration').textContent = product.concentration;
    document.getElementById('modalVolume').textContent = product.volume;
    document.getElementById('modalPrice').textContent = formatPrice(product.price) + ' ₽';
    document.getElementById('currentQty').textContent = currentQuantity;
    
    document.getElementById('productModal').style.display = 'flex';
}

// Закрыть модальное окно
function closeProductModal() {
    document.getElementById('productModal').style.display = 'none';
    currentModalProduct = null;
}

// Обновить отображение корзины
function updateCartUI() {
    // Обновляем счетчик внизу
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cartCount').textContent = totalItems;
    
    // Рендерим товары в корзине
    const container = document.getElementById('cartItems');
    
    if (cart.length === 0) {
        container.innerHTML = `
            <div class="empty-cart">
                🛒 Корзина пуста<br>
                <small>Добавьте товары из каталога</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = cart.map(item => {
        const product = products.find(p => p.id === item.id);
        if (!product) return '';
        
        const total = product.price * item.quantity;
        
        return `
            <div class="cart-item" data-id="${product.id}">
                <div class="cart-item-info">
                    <h4>${product.name}</h4>
                    <div class="cart-item-details">
                        ${product.concentration} • ${product.volume}
                    </div>
                    <div class="product-price">
                        ${formatPrice(product.price)} ₽ × ${item.quantity} = 
                        <strong>${formatPrice(total)} ₽</strong>
                    </div>
                </div>
                <div class="cart-item-actions">
                    <button class="copy-btn" onclick="copyProductData(${product.id})">
                        📋 Данные
                    </button>
                    <button class="remove-btn" onclick="removeFromCart(${product.id})">
                        ✕ Удалить
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// 4. ФУНКЦИОНАЛ КОРЗИНЫ
// ============================================

// Добавить товар в корзину
function addToCart() {
    if (!currentModalProduct) return;
    
    const existingItem = cart.find(item => item.id === currentModalProduct.id);
    
    if (existingItem) {
        existingItem.quantity += currentQuantity;
    } else {
        cart.push({
            id: currentModalProduct.id,
            quantity: currentQuantity
        });
    }
    
    saveCart();
    updateCartUI();
    closeProductModal();
    
    // Показываем уведомление
    showNotification(`Добавлено в корзину: ${currentModalProduct.name}`);
}

// Удалить товар из корзины
function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCart();
    updateCartUI();
}

// Скопировать данные товара
function copyProductData(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const text = `
${product.name}
Концентрация: ${product.concentration}
Объем: ${product.volume}
Цена: ${formatPrice(product.price)} ₽
Ссылка: ${window.location.origin}?product=${productId}
    `.trim();
    
    navigator.clipboard.writeText(text)
        .then(() => showNotification('Данные скопированы в буфер!'))
        .catch(() => showNotification('Ошибка копирования'));
}

// Скопировать весь заказ
function copyAllOrder() {
    if (cart.length === 0) {
        showNotification('Корзина пуста!');
        return;
    }
    
    let text = `ЗАКАЗ #${Date.now()}\n\n`;
    let total = 0;
    
    cart.forEach(item => {
        const product = products.find(p => p.id === item.id);
        if (!product) return;
        
        const itemTotal = product.price * item.quantity;
        total += itemTotal;
        
        text += `
${product.name}
${product.concentration} • ${product.volume}
${item.quantity} × ${formatPrice(product.price)} ₽ = ${formatPrice(itemTotal)} ₽
-------------------------
        `.trim() + '\n';
    });
    
    text += `\nИТОГО: ${formatPrice(total)} ₽`;
    text += `\n\nПользователь: ${currentUser?.first_name || 'Неизвестно'}`;
    text += `\nTelegram: @${currentUser?.username || 'скрыт'}`;
    
    navigator.clipboard.writeText(text)
        .then(() => showNotification('Весь заказ скопирован!'))
        .catch(() => showNotification('Ошибка копирования'));
}

// Оформить заказ
function checkout() {
    if (cart.length === 0) {
        showNotification('Добавьте товары в корзину!');
        return;
    }
    
    // Сохраняем корзину перед переходом
    saveCart();
    
    // Открываем чат с менеджером
    const message = encodeURIComponent(`Привет! Хочу оформить заказ из мини-приложения.`);
    const url = `https://t.me/${CONFIG.MANAGER_USERNAME.replace('@', '')}?start=${currentUser?.id || '0'}`;
    
    TelegramWebApp.openTelegramLink(url);
}

// ============================================
// 5. ПОИСК И СОРТИРОВКА
// ============================================

// Поиск товаров
function searchProducts(query) {
    const searchTerm = query.toLowerCase().trim();
    
    if (!searchTerm) {
        filteredProducts = [...products];
    } else {
        filteredProducts = products.filter(product =>
            product.name.toLowerCase().includes(searchTerm) ||
            product.concentration.toLowerCase().includes(searchTerm)
        );
    }
    
    sortProducts();
}

// Сортировка товаров
function sortProducts() {
    filteredProducts.sort((a, b) => {
        const priceA = parseFloat(a.price) || 0;
        const priceB = parseFloat(b.price) || 0;
        
        return sortDirection === 'asc' ? priceA - priceB : priceB - priceA;
    });
    
    renderProducts();
    
    // Обновляем текст кнопки
    const btn = document.getElementById('sortButton');
    btn.textContent = `Фильтр: По цене ${sortDirection === 'asc' ? '↑' : '↓'}`;
}

// Переключить сортировку
function toggleSort() {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    sortProducts();
}

// ============================================
// 6. НАВИГАЦИЯ
// ============================================

function showShopPage() {
    document.getElementById('catalog').style.display = 'grid';
    document.getElementById('cartPage').style.display = 'none';
    document.getElementById('shopTab').classList.add('active');
    document.getElementById('cartTab').classList.remove('active');
}

function showCartPage() {
    document.getElementById('catalog').style.display = 'none';
    document.getElementById('cartPage').style.display = 'block';
    document.getElementById('shopTab').classList.remove('active');
    document.getElementById('cartTab').classList.add('active');
}

// ============================================
// 7. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function formatPrice(price) {
    return parseInt(price).toLocaleString('ru-RU');
}

function showLoading(show) {
    const catalog = document.getElementById('catalog');
    if (show) {
        catalog.innerHTML = '<div class="loading">Загрузка...</div>';
    }
}

function showError(message) {
    const catalog = document.getElementById('catalog');
    catalog.innerHTML = `
        <div class="empty-cart">
            ⚠️ Ошибка<br>
            <small>${message}</small>
        </div>
    `;
}

function showNotification(message) {
    TelegramWebApp.showAlert(message);
}

// ============================================
// 8. НАСТРОЙКА СОБЫТИЙ
// ============================================
function setupEventListeners() {
    // Поиск
    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchProducts(e.target.value);
    });
    
    // Сортировка
    document.getElementById('sortButton').addEventListener('click', toggleSort);
    
    // Модальное окно
    document.getElementById('increaseQty').addEventListener('click', () => {
        currentQuantity++;
        document.getElementById('currentQty').textContent = currentQuantity;
    });
    
    document.getElementById('decreaseQty').addEventListener('click', () => {
        if (currentQuantity > 1) {
            currentQuantity--;
            document.getElementById('currentQty').textContent = currentQuantity;
        }
    });
    
    document.getElementById('addToCartBtn').addEventListener('click', addToCart);
    document.getElementById('closeModal').addEventListener('click', closeProductModal);
    
    // Закрыть модальное окно при клике на фон
    document.getElementById('productModal').addEventListener('click', (e) => {
        if (e.target.id === 'productModal') closeProductModal();
    });
    
    // Навигация
    document.getElementById('shopTab').addEventListener('click', showShopPage);
    document.getElementById('cartTab').addEventListener('click', showCartPage);
    document.getElementById('backToShop').addEventListener('click', showShopPage);
    
    // Корзина
    document.getElementById('copyAllBtn').addEventListener('click', copyAllOrder);
    document.getElementById('checkoutBtn').addEventListener('click', checkout);
}

// ============================================
// 9. ЗАПУСК ПРИЛОЖЕНИЯ
// ============================================
// Ждем загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    // Если мы в Telegram - инициализируем мини-приложение
    if (window.Telegram?.WebApp) {
        initTelegramApp();
    } else {
        // Режим разработки (браузер)
        console.log('Режим разработки: инициализация без Telegram');
        currentUser = { id: 99999, first_name: 'Тест', username: 'test_user' };
        loadProducts();
        setupEventListeners();
        showShopPage();
    }
});
