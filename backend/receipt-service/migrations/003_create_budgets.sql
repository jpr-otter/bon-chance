-- User Budgets per Category
-- Allows users to set monthly spending limits per category

CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    category_name VARCHAR(100) NOT NULL,
    monthly_limit DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, category_name)
);

-- Index for fast lookup by user
CREATE INDEX idx_budgets_user_id ON budgets(user_id);

-- Optional: Total budget across all categories
CREATE TABLE total_budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    monthly_limit DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
