def find_even_numbers(numbers):
    """Filter and return a list of even numbers from the given sequence.

    Args:
        numbers (iterable): A list or sequence of numbers.

    Returns:
        list: A list containing only the even numbers.
    """
    evens = []
    for n in numbers:
        if n % 2 == 0:
            evens.append(n)
    return evens


def calculate_discount(price, discount_percent):
    """Calculate the final price after applying a percentage discount.

    Args:
        price (float or int): The original price.
        discount_percent (float or int): The percentage discount to apply.

    Returns:
        float: The final price after the discount is applied.
    """
    total = price - (price * discount_percent / 100)
    return total
