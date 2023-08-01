CREATE TABLE estoque
(
foto varchar(255),
produto varchar(255),
descricao varchar(255),
categoria varchar(255),
estoque varchar(255)
);

ALTER TABLE `estoque`
  ADD COLUMN `id` int(11) NOT NULL AUTO_INCREMENT,
  ADD PRIMARY KEY (`id`);