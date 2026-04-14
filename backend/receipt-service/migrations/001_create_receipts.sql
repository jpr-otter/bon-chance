-- Produktkategorien (z.B. Obst, Gemüse, Milchprodukte)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    parent_category_id UUID REFERENCES categories(id)
);

-- Globale Produktdefinition
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    default_category_id UUID REFERENCES categories(id),
    barcode VARCHAR(50) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supermarktketten (z.B. Rewe, Aldi Süd)
CREATE TABLE store_chains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL
);

-- Einzelne Filialen
CREATE TABLE store_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chain_id UUID REFERENCES store_chains(id),
    name VARCHAR(255),
    address TEXT,
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    UNIQUE(chain_id, latitude, longitude)
);

-- Kassenbons
CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    store_location_id UUID REFERENCES store_locations(id),
    purchase_date TIMESTAMPTZ NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    raw_text TEXT,
    image_url VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Einzelne Artikel auf einem Bon
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    description_raw VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    quantity DECIMAL(10, 3) NOT NULL DEFAULT 1.0,
    unit_type VARCHAR(20),
    category_id UUID REFERENCES categories(id),
    is_corrected_by_user BOOLEAN DEFAULT FALSE,
    confidence_score REAL
);

-- Indexes
CREATE INDEX idx_products_name ON products USING gin (to_tsvector('german', name));
CREATE INDEX idx_receipts_user_id ON receipts(user_id);
CREATE INDEX idx_receipts_purchase_date ON receipts(purchase_date DESC);
CREATE INDEX idx_items_receipt_id ON items(receipt_id);