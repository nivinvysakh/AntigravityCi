def find_even_numbers(numbers):
    """Filters a list of numbers and returns only the even ones.

    Args:
        numbers (list[int | float]): A list of numbers to filter.

    Returns:
        list[int | float]: A list containing only the even numbers from the input.

    Examples:
        >>> find_even_numbers([1, 2, 3, 4, 5, 6])
        [2, 4, 6]
        >>> find_even_numbers([1, 3, 5])
        []
    """
    evens = []
    for n in numbers:
        if n % 2 == 0:
            evens.append(n)
    return evens


def calculate_discount(price, discount_percent):
    """Calculates the final price after applying a percentage discount.

    Args:
        price (float | int): The original price of the item.
        discount_percent (float | int): The percentage discount to apply.

    Returns:
        float: The total price after applying the discount.

    Examples:
        >>> calculate_discount(100, 20)
        80.0
        >>> calculate_discount(50.0, 10.0)
        45.0
    """
    total = price - (price * discount_percent / 100)
    return total
