def find_even_numbers(numbers):
    evens = []
    for n in numbers:
        if n % 2 == 0:
            evens.append(n)
    return evens


def calculate_discount(price, discount_percent):
    total = price - (price * discount_percent / 100)
    return total
