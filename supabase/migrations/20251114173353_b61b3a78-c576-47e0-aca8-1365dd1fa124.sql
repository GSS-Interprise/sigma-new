-- Enable RLS on profiles table if not already enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to recreate them properly
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- Allow all authenticated users to view all profiles (needed for selecting participants)
CREATE POLICY "Profiles are viewable by authenticated users"
ON profiles FOR SELECT
TO authenticated
USING (true);

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- Allow users to insert their own profile
CREATE POLICY "Users can insert their own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);