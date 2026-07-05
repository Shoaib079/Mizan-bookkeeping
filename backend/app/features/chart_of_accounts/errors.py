"""Chart of accounts domain errors — mapped to HTTP in api.py."""


class EmptyExpenseCategoryNameError(ValueError):
    """Category name missing after trim."""


class DuplicateExpenseCategoryNameError(ValueError):
    """Active expense account with same name (case-insensitive) already exists."""


class CustomExpenseCategoryLimitError(ValueError):
    """All codes in the 5900–5999 band are in use."""
