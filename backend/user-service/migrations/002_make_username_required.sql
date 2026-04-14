-- Make username required (NOT NULL)
-- First, update existing NULL usernames with a generated value
UPDATE users 
SET username = 'user_' || SUBSTRING(id::text FROM 1 FOR 8)
WHERE username IS NULL;

-- Now make username NOT NULL and keep UNIQUE constraint
ALTER TABLE users 
ALTER COLUMN username SET NOT NULL;

-- Update the index to remove the WHERE clause since username is now always present
DROP INDEX IF EXISTS idx_users_username;
CREATE INDEX idx_users_username ON users(username);