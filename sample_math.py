def find_even_numbers(numbers):
    """Filters and returns a list of even numbers from the input list.

    Args:
        numbers (list of int): A list of integers to evaluate.

    Returns:
        list of int: A list containing only the even integers.
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
        float: The total price after applying the discount.
    """
    total = price - (price * discount_percent / 100)
    return total
