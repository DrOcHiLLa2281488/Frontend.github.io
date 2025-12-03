// ============================================
// КОНФИГУРАЦИЯ
// ============================================
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbzmIsVoJxcDbkDeWOawrQHWrEhmAAefYBkcSu60FkS1dz9My4i5TV38LGn28ry56yl6aA/exec',
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
// 2. РАБОТА С API (Google Sheets) - ЧИСТАЯ ВЕРСИЯ
// ============================================

// Загрузить все товары из базы данных
async function loadProducts() {
    try {
        showLoading(true);
        
        console.log('Загружаю товары из базы данных...');
        const response = await fetch(`${CONFIG.API_URL}?sheet=Products`);
        
        if (!response.ok) {
            throw new Error(`HTTP ошибка: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Используем данные из Google Sheets
            products = data.data || [];
            
            // Убедимся, что у каждого товара есть id
            products.forEach((product, index) => {
                if (!product.id) {
                    product.id = index + 1; // Генерируем id на основе позиции
                }
            });
            
            console.log(`Успешно загружено ${products.length} товаров`);
            
            if (products.length === 0) {
                showError('Каталог товаров пуст. Добавьте товары в Google Sheets.');
                return;
            }
            
            filteredProducts = [...products];
            renderProducts();
        } else {
            throw new Error(data.error || 'Ошибка при загрузке данных');
        }
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        showError('Не удалось загрузить каталог. Проверьте подключение к интернету.');
    } finally {
        showLoading(false);
    }
}

// Получить корзину пользователя
async function loadCart() {
    if (!currentUser?.id) {
        console.log('Пользователь не идентифицирован, создаем временную корзину');
        cart = [];
        updateCartUI();
        return;
    }
    
    try {
        console.log('Загружаю корзину для пользователя:', currentUser.id);
        const response = await fetch(
            `${CONFIG.API_URL}?sheet=Carts&user_id=${currentUser.id}`
        );
        
        const data = await response.json();
        
        if (data.success) {
            cart = data.data || [];
            console.log('Корзина загружена:', cart);
            updateCartUI();
        } else {
            console.warn('Ошибка загрузки корзины:', data.error);
            cart = [];
        }
    } catch (error) {
        console.error('Ошибка загрузки корзины:', error);
        cart = [];
    }
}

// Сохранить корзину на сервер
async function saveCart() {
    if (!currentUser?.id) {
        console.log('Невозможно сохранить корзину: пользователь не идентифицирован');
        return;
    }
    
    try {
        console.log('Сохраняю корзину...');
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'UPDATE_CART',
                user_id: currentUser.id,
                cart: cart
            })
        });
        
        const result = await response.json();
        if (result.success) {
            console.log('Корзина успешно сохранена');
        } else {
            console.error('Ошибка сохранения корзины:', result.error);
        }
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
            <img src="${getImageUrl(product.image_url)}" 
                 alt="${product.name}" 
                 class="product-image"
                 onerror="this.src='https://via.placeholder.com/300x200?text=Нет+фото'">
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                <div class="product-details">
                    ${product.concentration || ''} ${product.concentration && product.volume ? '•' : ''} ${product.volume || ''}
                </div>
                <div class="product-price">
                    ${formatPrice(product.price)} ₽
                </div>
            </div>
        </div>
    `).join('');
    
    // Добавляем обработчики клика на товары
    document.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Проверяем, что клик не по кнопке внутри карточки
            if (e.target.tagName === 'BUTTON') return;
            
            const productId = parseInt(card.dataset.id);
            const product = products.find(p => p.id === productId);
            if (product) {
                openProductModal(product);
            }
        });
    });
}

// Получить корректный URL изображения
function getImageUrl(url) {
    if (!url) return 'https://via.placeholder.com/300x200?text=Нет+фото';
    
    // Убираем лишние пробелы
    url = url.trim();
    
    // Проверяем, начинается ли с http
    if (!url.startsWith('http')) {
        return 'https://via.placeholder.com/300x200?text=Нет+фото';
    }
    
    return url;
}

// Открыть модальное окно товара
function openProductModal(product) {
    if (!product) return;
    
    currentModalProduct = product;
    currentQuantity = 1;
    
    document.getElementById('modalImage').src = getImageUrl(product.image_url);
    document.getElementById('modalName').textContent = product.name;
    document.getElementById('modalConcentration').textContent = product.concentration || '';
    document.getElementById('modalVolume').textContent = product.volume || '';
    document.getElementById('modalPrice').textContent = formatPrice(product.price) + ' ₽';
    document.getElementById('currentQty').textContent = currentQuantity;
    
    // Показываем модальное окно
    document.getElementById('productModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// Закрыть модальное окно
function closeProductModal() {
    document.getElementById('productModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    currentModalProduct = null;
}

// Обновить отображение корзины
function updateCartUI() {
    // Обновляем счетчик внизу
    const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
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
    
    // Фильтруем только существующие товары
    const validCartItems = cart.filter(item => {
        const product = products.find(p => p.id === item.id);
        return product !== undefined;
    });
    
    // Если после фильтрации корзина пуста, обновляем
    if (validCartItems.length === 0) {
        cart = [];
        saveCart();
        container.innerHTML = `
            <div class="empty-cart">
                🛒 Корзина пуста<br>
                <small>Добавьте товары из каталога</small>
            </div>
        `;
        return;
    }
    
    // Если есть невалидные товары, обновляем корзину
    if (validCartItems.length !== cart.length) {
        cart = validCartItems;
        saveCart();
    }
    
    container.innerHTML = validCartItems.map(item => {
        const product = products.find(p => p.id === item.id);
        if (!product) return '';
        
        const quantity = item.quantity || 1;
        const total = product.price * quantity;
        
        return `
            <div class="cart-item" data-id="${product.id}">
                <div class="cart-item-info">
                    <h4>${product.name}</h4>
                    <div class="cart-item-details">
                        ${product.concentration || ''} ${product.concentration && product.volume ? '•' : ''} ${product.volume || ''}
                    </div>
                    <div class="product-price">
                        ${formatPrice(product.price)} ₽ × ${quantity} = 
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
    
    const existingItemIndex = cart.findIndex(item => item.id === currentModalProduct.id);
    
    if (existingItemIndex !== -1) {
        // Увеличиваем количество существующего товара
        cart[existingItemIndex].quantity = (cart[existingItemIndex].quantity || 1) + currentQuantity;
    } else {
        // Добавляем новый товар
        cart.push({
            id: currentModalProduct.id,
            quantity: currentQuantity
        });
    }
    
    saveCart();
    updateCartUI();
    closeProductModal();
    
    // Показываем уведомление
    showNotification(`✅ Добавлено в корзину: ${currentModalProduct.name} (${currentQuantity} шт.)`);
}

// Удалить товар из корзины
function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCart();
    updateCartUI();
    showNotification('🗑️ Товар удален из корзины');
}

// Скопировать данные товара
function copyProductData(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const text = `
${product.name}
Концентрация: ${product.concentration || 'не указана'}
Объем: ${product.volume || 'не указан'}
Цена: ${formatPrice(product.price)} ₽
    `.trim();
    
    navigator.clipboard.writeText(text)
        .then(() => showNotification('📋 Данные товара скопированы!'))
        .catch(() => showNotification('❌ Ошибка копирования'));
}

// Скопировать весь заказ
function copyAllOrder() {
    if (cart.length === 0) {
        showNotification('❌ Корзина пуста!');
        return;
    }
    
    let text = `=== ЗАКАЗ ИЗ PARFUMDEPO ===\n\n`;
    let total = 0;
    
    cart.forEach(item => {
        const product = products.find(p => p.id === item.id);
        if (!product) return;
        
        const quantity = item.quantity || 1;
        const itemTotal = product.price * quantity;
        total += itemTotal;
        
        text += `🏷️ ${product.name}\n`;
        if (product.concentration) text += `   Концентрация: ${product.concentration}\n`;
        if (product.volume) text += `   Объем: ${product.volume}\n`;
        text += `   ${quantity} × ${formatPrice(product.price)} ₽ = ${formatPrice(itemTotal)} ₽\n`;
        text += `   -----------------\n`;
    });
    
    text += `\n💰 ИТОГО: ${formatPrice(total)} ₽\n`;
    text += `\n👤 Пользователь: ${currentUser?.first_name || 'Неизвестно'}`;
    if (currentUser?.username) text += `\n📱 Telegram: @${currentUser.username}`;
    text += `\n\n📅 Дата: ${new Date().toLocaleString('ru-RU')}`;
    
    navigator.clipboard.writeText(text)
        .then(() => showNotification('📋 Весь заказ скопирован!'))
        .catch(() => showNotification('❌ Ошибка копирования'));
}

// Оформить заказ
function checkout() {
    if (cart.length === 0) {
        showNotification('❌ Добавьте товары в корзину!');
        return;
    }
    
    // Сохраняем корзину перед переходом
    saveCart();
    
    // Создаем текст заказа
    let orderText = `Здравствуйте! Хочу оформить заказ:\n\n`;
    let total = 0;
    
    cart.forEach(item => {
        const product = products.find(p => p.id === item.id);
        if (!product) return;
        
        const quantity = item.quantity || 1;
        const itemTotal = product.price * quantity;
        total += itemTotal;
        
        orderText += `• ${product.name}`;
        if (product.concentration) orderText += ` (${product.concentration})`;
        if (product.volume) orderText += `, ${product.volume}`;
        orderText += ` - ${quantity} шт. × ${formatPrice(product.price)} ₽ = ${formatPrice(itemTotal)} ₽\n`;
    });
    
    orderText += `\nИтого: ${formatPrice(total)} ₽`;
    orderText += `\n\nОт пользователя: ${currentUser?.first_name || 'Неизвестно'}`;
    if (currentUser?.username) orderText += ` (@${currentUser.username})`;
    
    // Кодируем текст для URL
    const encodedText = encodeURIComponent(orderText);
    
    // Открываем чат с менеджером
    const url = `https://t.me/${CONFIG.MANAGER_USERNAME.replace('@', '')}?text=${encodedText}`;
    
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
        filteredProducts = products.filter(product => {
            const name = product.name?.toLowerCase() || '';
            const concentration = product.concentration?.toLowerCase() || '';
            return name.includes(searchTerm) || concentration.includes(searchTerm);
        });
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
    const directionIcon = sortDirection === 'asc' ? '↑' : '↓';
    btn.textContent = `Фильтр: По цене ${directionIcon}`;
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
    const num = parseFloat(price) || 0;
    return num.toLocaleString('ru-RU');
}

function showLoading(show) {
    const catalog = document.getElementById('catalog');
    if (show) {
        catalog.innerHTML = '<div class="loading">⌛ Загрузка...</div>';
    }
}

function showError(message) {
    const catalog = document.getElementById('catalog');
    catalog.innerHTML = `
        <div class="empty-cart">
            ⚠️ Ошибка<br>
            <small>${message}</small><br>
            <small>Попробуйте обновить страницу</small>
        </div>
    `;
}

function showNotification(message) {
    if (TelegramWebApp) {
        TelegramWebApp.showAlert(message);
    } else {
        alert(message); // Для отладки в браузере
    }
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
        currentUser = { 
            id: Math.floor(Math.random() * 1000000), 
            first_name: 'Тестовый', 
            username: 'test_user' 
        };
        loadProducts();
        setupEventListeners();
        showShopPage();
    }
});

// Делаем функции глобальными для обработчиков onclick в HTML
window.copyProductData = copyProductData;
window.removeFromCart = removeFromCart;
