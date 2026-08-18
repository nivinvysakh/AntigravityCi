def find_even_numbers(numbers):
    """Filters a list of numbers and returns only the even ones.

    Args:
        numbers (list of int or float): A list of numbers to filter.

    Returns:
        list of int or float: A list containing only the even numbers.
    """
    evens = []
    for n in numbers:
        if n % 2 == 0:
            evens.append(n)
    return evens


def calculate_discount(price, discount_percent):
    """Calculates the total price after applying a percentage discount.

    Args:
        price (float): The original price of the item.
        discount_percent (float): The percentage discount to apply.

    Returns:
        float: The final price after discount.
    """
    total = price - (price * discount_percent / 100)
    return total
