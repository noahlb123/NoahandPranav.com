#sql to setup databases
CREATE DATABASE noahandpranav;
USE noahandpranav;

#to hold all accounts
CREATE TABLE accounts (
	id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(63) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
		token VARCHAR(63) NOT NULL,
		notifications BOOLEAN NOT NULL,
		grouptype BOOLEAN NOT NULL,
		active BOOLEAN NOT NULL,
    PRIMARY KEY (id)
);

#to hold all messages
CREATE TABLE messages (
	id INT NOT NULL AUTO_INCREMENT,
    sender_id INT NOT NULL,
    reciever_id INT NOT NULL,
		type TINYINT NOT NULL,
    message VARCHAR(2047),
    PRIMARY KEY (id),
    FOREIGN KEY (sender_id) REFERENCES accounts(id),
		FOREIGN KEY (reciever_id) REFERENCES accounts(id)
);
