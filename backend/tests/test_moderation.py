import pytest

from services.moderation import has_bad_words


@pytest.mark.parametrize("text", [
    # Everyday Vietnamese that is a swear word once the accents are gone.
    "Mưa lớn kéo dài, nước lên nhanh",
    "Các nhà ven sông đã kê đồ lên cao",
    "Bà con đi sơ tán từ buổi sáng",
    "Nhớ đeo áo phao, mang vài lon nước",
    "Mua lon nuoc, cac nha, di so tan, deo ao phao",  # the same, typed without accents
    "Dù mà nước rút thì đường vẫn trơn",
    "Xe máy 110 cc chết máy giữa đường",
    "Quả óc chó, đồ ăn cho chó mèo",
    # Everyday English that contains a swear word inside a longer word.
    "The class was cancelled, they will assess the damage",
    "Pass the shiitake, a niggling leak, fire retardant, Fukushima",
    "Scunthorpe, Cockburn street, Dickens",
    "",
])
def test_normal_reports_pass(text):
    assert not has_bad_words(text)


@pytest.mark.parametrize("text", [
    "Đm ngập hết rồi",
    "đ.m ngập hết rồi",
    "ngập vcl",
    "Địt mẹ, nước to quá",
    "dit me nuoc to qua",
    "Đường ngập như lồn",
    "ĐÉO ai đến giúp",
    "Fuck this flood",
    "f*cking flood",
    "What a bullshit forecast",
    "you are a bitch",
    "s-h-i-t",
    "Lồn",  # "lồn" typed with a separate accent mark
])
def test_swearing_is_caught(text):
    assert has_bad_words(text)


def test_checks_every_field_and_skips_empty_ones():
    assert has_bad_words("Lan", None, "fuck")
    assert not has_bad_words("Lan", None, "Đường Lê Lợi")
