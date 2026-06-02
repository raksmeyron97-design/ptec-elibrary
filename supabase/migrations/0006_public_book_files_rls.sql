CREATE POLICY "Public can view book files for published books" ON book_files FOR SELECT USING (
  EXISTS (SELECT 1 FROM books WHERE id = book_id AND is_published = true)
);
