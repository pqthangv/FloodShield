"""Seed data for disaster types (ThienTai) and their recommended actions.

Runs at startup and only inserts what is missing, so it is safe on an existing database.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from models.action_model import Action
from models.thientai_model import ThienTai

DISASTER_TYPES = [
    (1, 'Bão', [
        ('Theo dõi dự báo thời tiết', 'Cập nhật thường xuyên các bản tin dự báo thời tiết để nắm bắt thông tin về bão.'),
        ('Gia cố nhà cửa', 'Chằng chống mái tôn, cửa ra vào và cửa sổ để tránh bị tốc mái, hư hỏng.'),
        ('Cắt tỉa cây cối', 'Loại bỏ cành cây lớn, cây yếu gần nhà để phòng tránh đổ gãy gây nguy hiểm.'),
        ('Chuẩn bị đồ dùng khẩn cấp', 'Sẵn sàng đèn pin, nến, nước uống đóng chai và đồ ăn khô dự trữ.'),
        ('Bảo vệ tài sản', 'Di chuyển đồ đạc, tài sản có giá trị lên khu vực cao ráo, tránh ngập lụt.'),
        ('Ngắt thiết bị điện', 'Tắt các thiết bị điện khi có mưa bão lớn để tránh chập cháy.'),
        ('Tìm nơi trú ẩn an toàn', 'Di chuyển đến nơi trú ẩn kiên cố khi bão đổ bộ.'),
        ('Không ra ngoài khi bão', 'Tuyệt đối không đi ra ngoài trong thời gian bão đang diễn ra.'),
        ('Liên hệ cứu hộ', 'Thông báo ngay cho chính quyền địa phương nếu cần sự hỗ trợ cứu hộ.'),
        ('Khắc phục sau bão', 'Kiểm tra và tiến hành sửa chữa những thiệt hại sau khi bão tan.'),
    ]),
    (2, 'Lũ', [
        ('Cập nhật cảnh báo lũ', 'Theo dõi sát sao các thông tin cảnh báo lũ từ cơ quan chức năng.'),
        ('Sơ tán khẩn cấp', 'Di chuyển người và tài sản đến vùng đất cao, an toàn khi có lệnh hoặc nguy cơ lũ.'),
        ('Ngắt nguồn điện', 'Tắt cầu dao điện để phòng tránh tai nạn điện giật do ngập nước.'),
        ('Không lội nước nguy hiểm', 'Tuyệt đối không cố gắng đi qua vùng nước chảy xiết.'),
        ('Chuẩn bị phương tiện cứu sinh', 'Sẵn sàng thuyền, phao cứu sinh (nếu có điều kiện).'),
        ('Dự trữ nhu yếu phẩm', 'Chuẩn bị nước uống, lương thực khô và thuốc men cần thiết.'),
        ('Giữ liên lạc', 'Duy trì liên lạc với chính quyền địa phương để nhận thông tin và hỗ trợ.'),
        ('Tuân thủ sơ tán', 'Thực hiện nghiêm túc hướng dẫn sơ tán của lực lượng cứu hộ.'),
        ('Vệ sinh sau lũ', 'Kiểm tra và đảm bảo vệ sinh nguồn nước, thực phẩm sau khi lũ rút.'),
        ('Ổn định cuộc sống', 'Tham gia vào công tác khôi phục nhà cửa và ổn định cuộc sống sau lũ.'),
    ]),
    (3, 'Cháy rừng', [
        ('Nâng cao ý thức phòng cháy', 'Tuyên truyền và thực hiện nghiêm các quy định về phòng cháy chữa cháy rừng.'),
        ('Không gây cháy', 'Tuyệt đối không đốt lửa, vứt tàn thuốc bừa bãi trong hoặc gần khu vực rừng.'),
        ('Báo cháy kịp thời', 'Thông báo ngay lập tức cho cơ quan chức năng khi phát hiện đám cháy rừng.'),
        ('Tham gia chữa cháy (nếu có)', 'Hỗ trợ lực lượng chữa cháy rừng nếu được huy động và có kỹ năng phù hợp.'),
        ('Sơ tán khỏi vùng nguy hiểm', 'Nhanh chóng di chuyển người và tài sản ra khỏi khu vực có nguy cơ cháy lan.'),
        ('Bảo vệ hô hấp', 'Che chắn mặt và cơ thể bằng vải ướt để tránh hít phải khói bụi.'),
        ('Di chuyển theo hướng an toàn', 'Di chuyển theo hướng ngược gió để tránh bị ngạt khói và lửa.'),
        ('Tìm nguồn nước dập lửa', 'Sử dụng nguồn nước gần nhất để dập lửa hoặc làm ướt quần áo bảo vệ.'),
        ('Gọi cấp cứu khi bị thương', 'Liên hệ ngay với dịch vụ cấp cứu nếu có người bị thương do cháy.'),
        ('Hợp tác khắc phục', 'Phối hợp với các lực lượng chức năng trong công tác chữa cháy và xử lý hậu quả.'),
    ]),
    (4, 'Sạt lở', [
        ('Quan sát dấu hiệu sạt lở', 'Chú ý theo dõi các vết nứt trên đất, tường, hiện tượng cây nghiêng bất thường.'),
        ('Sơ tán lập tức', 'Di chuyển ngay đến nơi an toàn khi phát hiện nguy cơ sạt lở.'),
        ('Tránh xa khu vực nguy hiểm', 'Không đến gần các khu vực có nguy cơ sạt lở cao.'),
        ('Báo cáo chính quyền', 'Thông báo cho chính quyền địa phương về tình hình sạt lở hoặc nguy cơ sạt lở.'),
        ('Không xây dựng nơi nguy hiểm', 'Tránh xây dựng nhà cửa ở khu vực có địa chất yếu, dễ sạt lở.'),
        ('Gia cố phòng ngừa', 'Thực hiện các biện pháp gia cố tại các khu vực có nguy cơ sạt lở (nếu có thể).'),
        ('Chuẩn bị cứu hộ cơ bản', 'Sẵn sàng các vật dụng cứu hộ cần thiết như dây thừng, đèn pin.'),
        ('Tìm nơi trú ẩn an toàn', 'Di chuyển đến nơi trú ẩn vững chắc khi sạt lở xảy ra.'),
        ('Cảnh giác sạt lở thứ cấp', 'Đề phòng các đợt sạt lở tiếp theo sau mưa lớn kéo dài.'),
        ('Hợp tác khắc phục hậu quả', 'Tham gia vào các hoạt động khắc phục hậu quả sạt lở do chính quyền tổ chức.'),
    ]),
    (5, 'Hạn hán', [
        ('Tiết kiệm nước', 'Sử dụng nước một cách hợp lý và tiết kiệm trong sinh hoạt hàng ngày.'),
        ('Tích trữ nước', 'Chủ động tích trữ nước sạch khi có điều kiện.'),
        ('Tìm kiếm nguồn nước khác', 'Tìm kiếm và khai thác các nguồn nước thay thế (nếu có).'),
        ('Ưu tiên nước sinh hoạt', 'Đảm bảo ưu tiên nguồn nước cho các nhu cầu sinh hoạt thiết yếu.'),
        ('Theo dõi thông tin hạn hán', 'Cập nhật thường xuyên thông tin về tình hình hạn hán từ các cơ quan chức năng.'),
        ('Điều chỉnh canh tác', 'Thay đổi lịch gieo trồng và lựa chọn cây trồng phù hợp với điều kiện khô hạn.'),
        ('Chăm sóc cây trồng, vật nuôi', 'Áp dụng các biện pháp chăm sóc đặc biệt để giảm thiểu thiệt hại cho cây trồng và vật nuôi.'),
        ('Báo cáo tình hình thiếu nước', 'Thông báo cho chính quyền địa phương về tình trạng thiếu nước.'),
        ('Hỗ trợ cộng đồng', 'Tham gia các hoạt động hỗ trợ người dân bị ảnh hưởng bởi hạn hán.'),
        ('Áp dụng biện pháp chống hạn lâu dài', 'Tìm hiểu và thực hiện các giải pháp chống hạn bền vững.'),
    ]),
    (6, 'Nắng nóng', [
        ('Uống đủ nước', 'Uống nước lọc, nước trái cây hoặc dung dịch điện giải thường xuyên, kể cả khi chưa khát.'),
        ('Mặc quần áo thoáng mát', 'Chọn quần áo sáng màu, rộng, chất liệu cotton để dễ thoát mồ hôi.'),
        ('Hạn chế ra ngoài giữa trưa', 'Tránh ra ngoài trời từ 11h đến 15h, tìm bóng râm hoặc ở trong nhà.'),
        ('Che chắn khi ra ngoài', 'Đội mũ rộng vành, đeo kính râm và dùng kem chống nắng.'),
        ('Tránh lao động nặng', 'Không làm việc quá sức dưới trời nắng; nghỉ ngơi thường xuyên ở nơi mát.'),
        ('Không để trẻ em trong xe', 'Không để trẻ em, người già hoặc vật nuôi trong ô tô đóng kín.'),
        ('Làm mát cơ thể', 'Tắm hoặc lau người bằng nước mát để hạ thân nhiệt.'),
        ('Ăn uống hợp lý', 'Ăn nhiều rau xanh, trái cây; hạn chế rượu bia và đồ uống có cồn.'),
        ('Nhận biết say nắng', 'Chóng mặt, buồn nôn, đau đầu, da nóng đỏ là dấu hiệu say nắng; đưa người bệnh vào chỗ mát và gọi 115.'),
        ('Phòng cháy nổ', 'Không quá tải thiết bị điện, tránh để vật dễ cháy gần nguồn nhiệt trong những ngày nắng nóng.'),
    ]),
    (7, 'Động đất', [
        ('Chuẩn bị trước', 'Cố định tủ, kệ cao vào tường; biết vị trí cầu dao điện, van gas trong nhà.'),
        ('Chuẩn bị túi khẩn cấp', 'Chuẩn bị nước, đồ ăn khô, đèn pin, thuốc men, còi và giấy tờ quan trọng.'),
        ('Nằm xuống - Che chắn - Bám chặt', 'Khi rung lắc: nằm xuống, chui xuống gầm bàn chắc chắn, che đầu cổ và bám chặt.'),
        ('Tránh xa cửa kính', 'Tránh xa cửa sổ, kính, vật treo và đồ đạc có thể rơi đổ.'),
        ('Không dùng thang máy', 'Không chạy ra ngoài hay dùng thang máy khi đang rung lắc.'),
        ('Nếu ở ngoài trời', 'Di chuyển ra khoảng trống, tránh xa nhà cao tầng, cây cối, cột điện.'),
        ('Nếu đang lái xe', 'Dừng xe ở nơi an toàn, tránh cầu, cầu vượt và đường hầm; ở lại trong xe.'),
        ('Kiểm tra sau động đất', 'Kiểm tra thương tích, rò rỉ gas, hư hỏng điện nước trước khi sử dụng lại.'),
        ('Đề phòng dư chấn', 'Dư chấn có thể xảy ra sau trận chính; không vào lại nhà bị nứt, hư hỏng.'),
        ('Cảnh giác sóng thần', 'Nếu ở vùng ven biển và cảm thấy rung mạnh, di chuyển ngay lên vùng đất cao.'),
    ]),
]


async def seed_disaster_types(db: AsyncSession):
    existing = set((await db.execute(select(ThienTai.id))).scalars().all())
    for type_id, name, actions in DISASTER_TYPES:
        if type_id in existing:
            continue
        db.add(ThienTai(id=type_id, name=name))
        await db.flush()
        for title, description in actions:
            db.add(Action(thien_tai_id=type_id, title=title, description=description))
    await db.commit()
