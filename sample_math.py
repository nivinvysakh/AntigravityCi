def find_even_numbers(numbers):
    """Filters a list of numbers and returns a list containing only the even numbers.

    Args:
        numbers (list): A list of numbers to filter.

    Returns:
        list: A list containing the even numbers from the input list.
    """
    evens = []
    for n in numbers:
        if n % 2 == 0:
            evens.append(n)
    return evens


def calculate_discount(price, discount_percent):
    """Calculates the discounted price based on the original price and discount percentage.

    Args:
        price (float or int): The original price.
        discount_percent (float or int): The discount percentage to apply.

    Returns:
        float: The final price after applying the discount.
    """
    total = price - (price * discount_percent / 100)
    return total
