from typing import List


def find_even_numbers(numbers: List[int]) -> List[int]:
    return [n for n in numbers if n % 2 == 0]


def calculate_discount(price: float, discount_percent: float) -> float:
    total = price - (price * discount_percent / 100)
    return total
