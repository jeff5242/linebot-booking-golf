-- Create admins table
CREATE TABLE IF NOT EXISTS public.admins (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    username text UNIQUE NOT NULL, -- Can be phone or email
    password text NOT NULL,        -- For this simple implementation, we store plain text. In production, consider hashing.
    name text,
    created_at timestamptz DEFAULT now()
);

-- Turn on Row Level Security
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Allow read access to everyone (or restricted) so we can check login
-- Ideally strict, but for client-side login check we need read access
CREATE POLICY "Enable read access for all users" ON public.admins FOR SELECT USING (true);

-- Insert default admin user
INSERT INTO public.admins (username, password, name)
VALUES ('admin', '123456', '預設管理員')
ON CONFLICT (username) DO NOTHING;
