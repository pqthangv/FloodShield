DROP TABLE IF EXISTS Actions;
DROP TABLE IF EXISTS ThienTai;

CREATE TABLE IF NOT EXISTS ThienTai (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS Actions (
    action_id INTEGER PRIMARY KEY AUTOINCREMENT,
    thien_tai_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    FOREIGN KEY (thien_tai_id) REFERENCES ThienTai(id) ON DELETE CASCADE
);

INSERT INTO ThienTai (id, name) VALUES (1, 'Bão');
INSERT INTO ThienTai (id, name) VALUES (2, 'Lũ');
INSERT INTO ThienTai (id, name) VALUES (3, 'Cháy rừng');
INSERT INTO ThienTai (id, name) VALUES (4, 'Sạt lở');
INSERT INTO ThienTai (id, name) VALUES (5, 'Hạn hán');

INSERT INTO Actions (thien_tai_id, title, description) VALUES
    (1, 'Theo dõi dự báo thời tiết', 'Cập nhật thường xuyên các bản tin dự báo thời tiết để nắm bắt thông tin về bão.'),
    (1, 'Gia cố nhà cửa', 'Chằng chống mái tôn, cửa ra vào và cửa sổ để tránh bị tốc mái, hư hỏng.'),
    (1, 'Cắt tỉa cây cối', 'Loại bỏ cành cây lớn, cây yếu gần nhà để phòng tránh đổ gãy gây nguy hiểm.'),
    (1, 'Chuẩn bị đồ dùng khẩn cấp', 'Sẵn sàng đèn pin, nến, nước uống đóng chai và đồ ăn khô dự trữ.'),
    (1, 'Bảo vệ tài sản', 'Di chuyển đồ đạc, tài sản có giá trị lên khu vực cao ráo, tránh ngập lụt.'),
    (1, 'Ngắt thiết bị điện', 'Tắt các thiết bị điện khi có mưa bão lớn để tránh chập cháy.'),
    (1, 'Tìm nơi trú ẩn an toàn', 'Di chuyển đến nơi trú ẩn kiên cố khi bão đổ bộ.'),
    (1, 'Không ra ngoài khi bão', 'Tuyệt đối không đi ra ngoài trong thời gian bão đang diễn ra.'),
    (1, 'Liên hệ cứu hộ', 'Thông báo ngay cho chính quyền địa phương nếu cần sự hỗ trợ cứu hộ.'),
    (1, 'Khắc phục sau bão', 'Kiểm tra và tiến hành sửa chữa những thiệt hại sau khi bão tan.');

INSERT INTO Actions (thien_tai_id, title, description) VALUES
    (2, 'Cập nhật cảnh báo lũ', 'Theo dõi sát sao các thông tin cảnh báo lũ từ cơ quan chức năng.'),
    (2, 'Sơ tán khẩn cấp', 'Di chuyển người và tài sản đến vùng đất cao, an toàn khi có lệnh hoặc nguy cơ lũ.'),
    (2, 'Ngắt nguồn điện', 'Tắt cầu dao điện để phòng tránh tai nạn điện giật do ngập nước.'),
    (2, 'Không lội nước nguy hiểm', 'Tuyệt đối không cố gắng đi qua vùng nước chảy xiết.'),
    (2, 'Chuẩn bị phương tiện cứu sinh', 'Sẵn sàng thuyền, phao cứu sinh (nếu có điều kiện).'),
    (2, 'Dự trữ nhu yếu phẩm', 'Chuẩn bị nước uống, lương thực khô và thuốc men cần thiết.'),
    (2, 'Giữ liên lạc', 'Duy trì liên lạc với chính quyền địa phương để nhận thông tin và hỗ trợ.'),
    (2, 'Tuân thủ sơ tán', 'Thực hiện nghiêm túc hướng dẫn sơ tán của lực lượng cứu hộ.'),
    (2, 'Vệ sinh sau lũ', 'Kiểm tra và đảm bảo vệ sinh nguồn nước, thực phẩm sau khi lũ rút.'),
    (2, 'Ổn định cuộc sống', 'Tham gia vào công tác khôi phục nhà cửa và ổn định cuộc sống sau lũ.');

INSERT INTO Actions (thien_tai_id, title, description) VALUES
    (3, 'Nâng cao ý thức phòng cháy', 'Tuyên truyền và thực hiện nghiêm các quy định về phòng cháy chữa cháy rừng.'),
    (3, 'Không gây cháy', 'Tuyệt đối không đốt lửa, vứt tàn thuốc bừa bãi trong hoặc gần khu vực rừng.'),
    (3, 'Báo cháy kịp thời', 'Thông báo ngay lập tức cho cơ quan chức năng khi phát hiện đám cháy rừng.'),
    (3, 'Tham gia chữa cháy (nếu có)', 'Hỗ trợ lực lượng chữa cháy rừng nếu được huy động và có kỹ năng phù hợp.'),
    (3, 'Sơ tán khỏi vùng nguy hiểm', 'Nhanh chóng di chuyển người và tài sản ra khỏi khu vực có nguy cơ cháy lan.'),
    (3, 'Bảo vệ hô hấp', 'Che chắn mặt và cơ thể bằng vải ướt để tránh hít phải khói bụi.'),
    (3, 'Di chuyển theo hướng an toàn', 'Di chuyển theo hướng ngược gió để tránh bị ngạt khói và lửa.'),
    (3, 'Tìm nguồn nước dập lửa', 'Sử dụng nguồn nước gần nhất để dập lửa hoặc làm ướt quần áo bảo vệ.'),
    (3, 'Gọi cấp cứu khi bị thương', 'Liên hệ ngay với dịch vụ cấp cứu nếu có người bị thương do cháy.'),
    (3, 'Hợp tác khắc phục', 'Phối hợp với các lực lượng chức năng trong công tác chữa cháy và xử lý hậu quả.');

INSERT INTO Actions (thien_tai_id, title, description) VALUES
    (4, 'Quan sát dấu hiệu sạt lở', 'Chú ý theo dõi các vết nứt trên đất, tường, hiện tượng cây nghiêng bất thường.'),
    (4, 'Sơ tán lập tức', 'Di chuyển ngay đến nơi an toàn khi phát hiện nguy cơ sạt lở.'),
    (4, 'Tránh xa khu vực nguy hiểm', 'Không đến gần các khu vực có nguy cơ sạt lở cao.'),
    (4, 'Báo cáo chính quyền', 'Thông báo cho chính quyền địa phương về tình hình sạt lở hoặc nguy cơ sạt lở.'),
    (4, 'Không xây dựng nơi nguy hiểm', 'Tránh xây dựng nhà cửa ở khu vực có địa chất yếu, dễ sạt lở.'),
    (4, 'Gia cố phòng ngừa', 'Thực hiện các biện pháp gia cố tại các khu vực có nguy cơ sạt lở (nếu có thể).'),
    (4, 'Chuẩn bị cứu hộ cơ bản', 'Sẵn sàng các vật dụng cứu hộ cần thiết như dây thừng, đèn pin.'),
    (4, 'Tìm nơi trú ẩn an toàn', 'Di chuyển đến nơi trú ẩn vững chắc khi sạt lở xảy ra.'),
    (4, 'Cảnh giác sạt lở thứ cấp', 'Đề phòng các đợt sạt lở tiếp theo sau mưa lớn kéo dài.'),
    (4, 'Hợp tác khắc phục hậu quả', 'Tham gia vào các hoạt động khắc phục hậu quả sạt lở do chính quyền tổ chức.');

INSERT INTO Actions (thien_tai_id, title, description) VALUES
    (5, 'Tiết kiệm nước', 'Sử dụng nước một cách hợp lý và tiết kiệm trong sinh hoạt hàng ngày.'),
    (5, 'Tích trữ nước', 'Chủ động tích trữ nước sạch khi có điều kiện.'),
    (5, 'Tìm kiếm nguồn nước khác', 'Tìm kiếm và khai thác các nguồn nước thay thế (nếu có).'),
    (5, 'Ưu tiên nước sinh hoạt', 'Đảm bảo ưu tiên nguồn nước cho các nhu cầu sinh hoạt thiết yếu.'),
    (5, 'Theo dõi thông tin hạn hán', 'Cập nhật thường xuyên thông tin về tình hình hạn hán từ các cơ quan chức năng.'),
    (5, 'Điều chỉnh canh tác', 'Thay đổi lịch gieo trồng và lựa chọn cây trồng phù hợp với điều kiện khô hạn.'),
    (5, 'Chăm sóc cây trồng, vật nuôi', 'Áp dụng các biện pháp chăm sóc đặc biệt để giảm thiểu thiệt hại cho cây trồng và vật nuôi.'),
    (5, 'Báo cáo tình hình thiếu nước', 'Thông báo cho chính quyền địa phương về tình trạng thiếu nước.'),
    (5, 'Hỗ trợ cộng đồng', 'Tham gia các hoạt động hỗ trợ người dân bị ảnh hưởng bởi hạn hán.'),
    (5, 'Áp dụng biện pháp chống hạn lâu dài', 'Tìm hiểu và thực hiện các giải pháp chống hạn bền vững.');