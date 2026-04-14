-- Initialize database with some seed data

-- Insert some basic categories
INSERT INTO categories (id, name) VALUES 
    (uuid_generate_v4(), 'Lebensmittel'),
    (uuid_generate_v4(), 'Obst & Gemüse'),
    (uuid_generate_v4(), 'Milchprodukte'),
    (uuid_generate_v4(), 'Fleisch & Wurst'),
    (uuid_generate_v4(), 'Getränke'),
    (uuid_generate_v4(), 'Süßwaren'),
    (uuid_generate_v4(), 'Hygieneartikel'),
    (uuid_generate_v4(), 'Haushalt'),
    (uuid_generate_v4(), 'Sonstiges')
ON CONFLICT (name) DO NOTHING;

-- Insert some common store chains
INSERT INTO store_chains (id, name) VALUES 
    (uuid_generate_v4(), 'Rewe'),
    (uuid_generate_v4(), 'Edeka'),
    (uuid_generate_v4(), 'Aldi Süd'),
    (uuid_generate_v4(), 'Aldi Nord'),
    (uuid_generate_v4(), 'Lidl'),
    (uuid_generate_v4(), 'Kaufland'),
    (uuid_generate_v4(), 'Penny'),
    (uuid_generate_v4(), 'Netto')
ON CONFLICT (name) DO NOTHING;