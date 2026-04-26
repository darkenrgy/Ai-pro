package com.darkenrgy.login.auth;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class LoginAuthApplication {

	public static void main(String[] args) {
		SpringApplication.run(LoginAuthApplication.class, args);
	}

}
