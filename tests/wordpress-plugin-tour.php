<?php

$admin = get_user_by( 'login', 'admin' );
wp_set_current_user( $admin->ID );

if ( ! function_exists( 'annotate_review_tour_page' ) ) {
	throw new RuntimeException( 'The plugin does not expose its welcome tour page.' );
}

annotate_review_register_tour_page();
$items = $GLOBALS['submenu']['edit.php?post_type=annotate_review'] ?? array();
$slugs = wp_list_pluck( $items, 2 );
if ( ! in_array( 'annotate-review-tour', $slugs, true ) ) {
	throw new RuntimeException( 'Design Reviews does not contain the Rondleiding page.' );
}

$_GET['page'] = 'annotate-review-tour';
annotate_review_tour_admin_assets();
if ( ! wp_script_is( 'annotate-review-tour', 'enqueued' ) || ! wp_script_is( 'annotate-review', 'enqueued' ) ) {
	throw new RuntimeException( 'The tour does not load its controller and bundled Annotate runtime.' );
}
if ( wp_script_is( 'annotate-review-bridge', 'enqueued' ) ) {
	throw new RuntimeException( 'The safe tour loaded the real WordPress submission bridge.' );
}

ob_start();
annotate_review_tour_page();
$html = ob_get_clean();
if ( false === strpos( $html, 'Welkom bij Forcys Annotate' ) || false === strpos( $html, 'data-review-block' ) ) {
	throw new RuntimeException( 'The Dutch practice content is incomplete.' );
}

echo "WordPress welcome tour test passed.\n";
