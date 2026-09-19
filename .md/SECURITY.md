# Security Requirements

## Environment Variables
- Never commit `.env` containing local PostgreSQL passwords.
- Maintain a `.env.example` file for standard setup instructions.

## Input Validation
- Validate all incoming POST requests (ensure `title` is not empty).
- Parameterize all SQL queries (`$1, $2`) to prevent SQL injection.