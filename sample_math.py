def find_even_numbers(numbers):
    """Filters a list of numbers and returns only the even numbers.

    Args:
        numbers (list of int): A list of integer numbers to check.

    Returns:
        list of int: A list containing only the even numbers.
    """
    evens = []
    for n in numbers:
        if n % 2 == 0:
            evens.append(n)
    return evens


def calculate_discount(price, discount_percent):
    """Calculates the final price after applying a percentage discount.

    Args:
        price (float): The original price before discount.
        discount_percent (float): The discount percentage to apply.

    Returns:
        float: The final calculated price after discount.
    """
    total = price - (price * discount_percent / 100)
    return total
