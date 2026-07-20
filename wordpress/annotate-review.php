<?php
/**
 * Plugin Name: Annotate Review
 * Description: Collects authenticated visual website reviews as portable JSON.
 * Version: 1.1.0
 * Author: reviewjs contributors
 * License: MIT
 * License URI: https://opensource.org/license/mit
 */

defined( 'ABSPATH' ) || exit;

define( 'ANNOTATE_REVIEW_VERSION', '1.1.0' );

function annotate_review_register_post_type() {
	register_post_type(
		'annotate_review',
		array(
			'labels'             => array(
				'name'          => __( 'Design Reviews', 'annotate-review' ),
				'singular_name' => __( 'Design Review', 'annotate-review' ),
			),
			'public'             => false,
			'publicly_queryable' => false,
			'show_ui'            => true,
			'show_in_rest'       => false,
			'capability_type'     => 'page',
			'map_meta_cap'       => true,
			'supports'           => array( 'title', 'author' ),
			'menu_icon'          => 'dashicons-format-chat',
		),
	);
}
add_action( 'init', 'annotate_review_register_post_type' );

function annotate_review_enqueue() {
	if ( ! current_user_can( 'edit_pages' ) ) {
		return;
	}
	$user = wp_get_current_user();
	wp_enqueue_script(
		'annotate-review-bridge',
		plugins_url( 'annotate-review.js', __FILE__ ),
		array(),
		ANNOTATE_REVIEW_VERSION,
		true
	);
	wp_localize_script(
		'annotate-review-bridge',
		'AnnotateWordPress',
		array(
			'restUrl'  => rest_url( 'annotate/v1/reviews' ),
			'mediaUrl' => rest_url( 'wp/v2/media' ),
			'nonce'    => wp_create_nonce( 'wp_rest' ),
			'canUpload' => current_user_can( 'upload_files' ),
			'reviewer' => array(
				'name'  => $user->display_name,
				'email' => $user->user_email,
			),
		)
	);
	wp_add_inline_script(
		'annotate-review-bridge',
		'window.AnnotateConfig = {project:' . wp_json_encode( sanitize_title( get_bloginfo( 'name' ) ) ) . '};',
		'before'
	);
	wp_enqueue_script(
		'annotate-review',
		plugins_url( 'annotate.js', __FILE__ ),
		array( 'annotate-review-bridge' ),
		ANNOTATE_REVIEW_VERSION,
		true
	);
}
add_action( 'wp_enqueue_scripts', 'annotate_review_enqueue' );

function annotate_review_admin_bar( WP_Admin_Bar $bar ) {
	if ( is_admin() || ! current_user_can( 'edit_pages' ) ) {
		return;
	}
	$bar->add_node(
		array(
			'id'    => 'annotate-review',
			'title' => __( 'Annotate page', 'annotate-review' ),
			'href'  => '#',
		)
	);
}
add_action( 'admin_bar_menu', 'annotate_review_admin_bar', 90 );

function annotate_review_can_submit( WP_REST_Request $request ) {
	return current_user_can( 'edit_pages' ) && wp_verify_nonce( $request->get_header( 'X-WP-Nonce' ), 'wp_rest' );
}

function annotate_review_submit( WP_REST_Request $request ) {
	$params   = $request->get_json_params();
	$params   = is_array( $params ) ? $params : $request->get_body_params();
	$review   = isset( $params['review'] ) && is_array( $params['review'] ) ? $params['review'] : null;
	$reviewer = isset( $params['reviewer'] ) && is_array( $params['reviewer'] ) ? $params['reviewer'] : array();
	$name     = sanitize_text_field( $reviewer['name'] ?? '' );
	$email    = sanitize_email( $reviewer['email'] ?? '' );
	$message  = sanitize_textarea_field( $params['message'] ?? '' );

	if ( ! $review || empty( $review['comments'] ) || ! is_array( $review['comments'] ) ) {
		return new WP_Error( 'annotate_empty_review', __( 'Add at least one annotation before submitting.', 'annotate-review' ), array( 'status' => 400 ) );
	}
	if ( count( $review['comments'] ) > 500 || strlen( wp_json_encode( $review ) ) > 1024 * 1024 ) {
		return new WP_Error( 'annotate_review_too_large', __( 'This review is too large to submit.', 'annotate-review' ), array( 'status' => 413 ) );
	}
	if ( ! $name || ! is_email( $email ) ) {
		return new WP_Error( 'annotate_invalid_reviewer', __( 'Enter a name and valid email address.', 'annotate-review' ), array( 'status' => 400 ) );
	}

	$url      = esc_url_raw( $review['url'] ?? '' );
	$scheme   = wp_parse_url( $url, PHP_URL_SCHEME );
	$url_host = wp_parse_url( $url, PHP_URL_HOST );
	$our_host = wp_parse_url( home_url(), PHP_URL_HOST );
	if ( ! in_array( $scheme, array( 'http', 'https' ), true ) || ! $url_host || strtolower( $url_host ) !== strtolower( $our_host ) ) {
		return new WP_Error( 'annotate_invalid_url', __( 'The reviewed page must belong to this site.', 'annotate-review' ), array( 'status' => 400 ) );
	}

	$counts = array( 'keep' => 0, 'change' => 0, 'question' => 0 );
	foreach ( $review['comments'] as $index => $comment ) {
		if ( ! is_array( $comment ) ) {
			return new WP_Error( 'annotate_invalid_comment', __( 'The review contains an invalid annotation.', 'annotate-review' ), array( 'status' => 400 ) );
		}
		if ( 'element' === ( $comment['type'] ?? '' ) ) {
			$verdict = $comment['verdict'] ?? '';
			if ( ! isset( $counts[ $verdict ] ) || ! trim( (string) ( $comment['text'] ?? '' ) ) ) {
				return new WP_Error( 'annotate_invalid_element_comment', __( 'Every element annotation needs a verdict and comment.', 'annotate-review' ), array( 'status' => 400 ) );
			}
			++$counts[ $verdict ];
		}

		$has_image     = isset( $comment['proposal']['image'] );
		$attachment_id = absint( $comment['proposal']['image']['attachment']['id'] ?? 0 );
		if ( $has_image && ! $attachment_id ) {
			return new WP_Error( 'annotate_invalid_attachment', __( 'The review contains an unavailable image.', 'annotate-review' ), array( 'status' => 400 ) );
		}
		if ( $attachment_id ) {
			if ( ! wp_attachment_is_image( $attachment_id ) || ! current_user_can( 'edit_post', $attachment_id ) ) {
				return new WP_Error( 'annotate_invalid_attachment', __( 'The review contains an unavailable image.', 'annotate-review' ), array( 'status' => 400 ) );
			}
			$metadata = wp_get_attachment_metadata( $attachment_id );
			$file     = get_attached_file( $attachment_id );
			$review['comments'][ $index ]['proposal']['image']['attachment'] = array(
				'id'       => $attachment_id,
				'url'      => wp_get_attachment_url( $attachment_id ),
				'filename' => $file ? wp_basename( $file ) : '',
				'mime'     => get_post_mime_type( $attachment_id ),
				'width'    => is_array( $metadata ) ? ( $metadata['width'] ?? null ) : null,
				'height'   => is_array( $metadata ) ? ( $metadata['height'] ?? null ) : null,
			);
		}
	}

	$path    = wp_parse_url( $url, PHP_URL_PATH ) ?: '/';
	$post_id = wp_insert_post(
		array(
			'post_type'    => 'annotate_review',
			'post_status'  => 'private',
			'post_author'  => get_current_user_id(),
			'post_title'   => sprintf( __( 'Review of %s', 'annotate-review' ), $path ),
		),
		true
	);
	if ( is_wp_error( $post_id ) ) {
		return $post_id;
	}

	$submitter = wp_get_current_user();
	$review['submission'] = array(
		'id'          => $post_id,
		'submittedAt' => current_time( 'c', true ),
		'reviewer'    => array( 'name' => $name, 'email' => $email ),
		'submittedBy' => array( 'id' => $submitter->ID, 'name' => $submitter->display_name, 'email' => $submitter->user_email ),
		'message'     => $message,
		'counts'      => $counts,
	);
	$json = wp_json_encode( $review, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
	if ( false === $json || false === update_post_meta( $post_id, '_annotate_review_json', wp_slash( $json ) ) ) {
		wp_delete_post( $post_id, true );
		return new WP_Error( 'annotate_storage_failed', __( 'The review could not be stored.', 'annotate-review' ), array( 'status' => 500 ) );
	}
	update_post_meta( $post_id, '_annotate_url', $url );
	update_post_meta( $post_id, '_annotate_counts', $counts );
	update_post_meta( $post_id, '_annotate_message', $message );

	$edit_url  = get_edit_post_link( $post_id, '' );
	$export_url = wp_nonce_url(
		admin_url( 'admin-post.php?action=annotate_review_export&review=' . $post_id ),
		'annotate_review_export_' . $post_id
	);
	$recipient = sanitize_email( get_option( 'annotate_review_recipient', get_option( 'admin_email' ) ) );
	$recipient = $recipient ?: sanitize_email( get_option( 'admin_email' ) );
	$subject   = sprintf( __( 'Website review #%d submitted', 'annotate-review' ), $post_id );
	$body      = implode(
		"\n",
		array(
			sprintf( __( '%1$s <%2$s> submitted a website review.', 'annotate-review' ), $submitter->display_name, $submitter->user_email ),
			sprintf( __( 'Review contact: %1$s <%2$s>', 'annotate-review' ), $name, $email ),
			$url,
			$message,
			sprintf( __( 'Keep: %1$d | Change: %2$d | Questions: %3$d', 'annotate-review' ), $counts['keep'], $counts['change'], $counts['question'] ),
			$edit_url,
		)
	);
	$mail_sent = (bool) wp_mail( $recipient, $subject, $body );

	return new WP_REST_Response(
		array(
			'id'        => $post_id,
			'mailSent'  => $mail_sent,
			'adminUrl'  => $edit_url,
			'exportUrl' => $export_url,
		),
		201
	);
}

function annotate_review_register_routes() {
	register_rest_route(
		'annotate/v1',
		'/reviews',
		array(
			'methods'             => WP_REST_Server::CREATABLE,
			'permission_callback' => 'annotate_review_can_submit',
			'callback'            => 'annotate_review_submit',
		),
	);
}
add_action( 'rest_api_init', 'annotate_review_register_routes' );

function annotate_review_export() {
	$post_id = absint( $_GET['review'] ?? 0 );
	$post    = get_post( $post_id );
	if ( ! $post || 'annotate_review' !== $post->post_type || ! current_user_can( 'edit_post', $post_id ) ) {
		wp_die( esc_html__( 'You cannot export this review.', 'annotate-review' ), '', array( 'response' => 403 ) );
	}
	check_admin_referer( 'annotate_review_export_' . $post_id );
	nocache_headers();
	header( 'Content-Type: application/json; charset=utf-8' );
	header( 'Content-Disposition: attachment; filename="annotate-review-' . $post_id . '.json"' );
	header( 'X-Content-Type-Options: nosniff' );
	echo get_post_meta( $post_id, '_annotate_review_json', true ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- JSON download, never HTML.
	exit;
}
add_action( 'admin_post_annotate_review_export', 'annotate_review_export' );

function annotate_review_settings() {
	register_setting(
		'general',
		'annotate_review_recipient',
		array(
			'type'              => 'string',
			'sanitize_callback' => 'sanitize_email',
			'default'           => get_option( 'admin_email' ),
		)
	);
	add_settings_field(
		'annotate_review_recipient',
		__( 'Website review recipient', 'annotate-review' ),
		'annotate_review_recipient_field',
		'general'
	);
}
add_action( 'admin_init', 'annotate_review_settings' );

function annotate_review_recipient_field() {
	$value = get_option( 'annotate_review_recipient', get_option( 'admin_email' ) );
	printf(
		'<input class="regular-text" type="email" name="annotate_review_recipient" value="%s" required><p class="description">%s</p>',
		esc_attr( $value ),
		esc_html__( 'Receives a link and summary when an authorized reviewer submits annotations.', 'annotate-review' )
	);
}

function annotate_review_add_meta_box() {
	add_meta_box(
		'annotate-review-summary',
		__( 'Submitted review', 'annotate-review' ),
		'annotate_review_meta_box',
		'annotate_review',
		'normal',
		'high'
	);
}
add_action( 'add_meta_boxes_annotate_review', 'annotate_review_add_meta_box' );

function annotate_review_meta_box( WP_Post $post ) {
	$data       = json_decode( get_post_meta( $post->ID, '_annotate_review_json', true ), true );
	$submission = is_array( $data ) ? ( $data['submission'] ?? array() ) : array();
	$counts     = $submission['counts'] ?? array();
	$url        = get_post_meta( $post->ID, '_annotate_url', true );
	$message    = get_post_meta( $post->ID, '_annotate_message', true );
	$export_url = wp_nonce_url(
		admin_url( 'admin-post.php?action=annotate_review_export&review=' . $post->ID ),
		'annotate_review_export_' . $post->ID
	);
	echo '<p><strong>' . esc_html__( 'Page:', 'annotate-review' ) . '</strong> <a href="' . esc_url( $url ) . '">' . esc_html( $url ) . '</a></p>';
	echo '<p><strong>' . esc_html__( 'Reviewer:', 'annotate-review' ) . '</strong> ' . esc_html( $submission['reviewer']['name'] ?? '' ) . ' &lt;' . esc_html( $submission['reviewer']['email'] ?? '' ) . '&gt;</p>';
	echo '<p><strong>' . esc_html__( 'Decisions:', 'annotate-review' ) . '</strong> ' . esc_html( sprintf( 'Keep %d · Change %d · Questions %d', $counts['keep'] ?? 0, $counts['change'] ?? 0, $counts['question'] ?? 0 ) ) . '</p>';
	if ( $message ) {
		echo '<p><strong>' . esc_html__( 'Message:', 'annotate-review' ) . '</strong><br>' . nl2br( esc_html( $message ) ) . '</p>';
	}
	echo '<p><a class="button button-primary" href="' . esc_url( $export_url ) . '">' . esc_html__( 'Download review JSON', 'annotate-review' ) . '</a></p>';
}

function annotate_review_disable_block_editor( $use_block_editor, $post_type ) {
	return 'annotate_review' === $post_type ? false : $use_block_editor;
}
add_filter( 'use_block_editor_for_post_type', 'annotate_review_disable_block_editor', 10, 2 );
